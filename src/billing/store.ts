import { decideAccess, nextCache, parseCache, purchasesToAcknowledge, serializeCache } from './entitlement';
import {
  BillingError,
  RECHECK_INTERVAL_MS,
  type Access,
  type BillingErrorCode,
  type BillingGateway,
  type EntitlementCache,
  type ProductInfo,
  type Verification,
} from './types';

/** Where the little "last verified" memory lives (the browser's storage in the app, a Map in tests). */
export interface MemoryStorage {
  read(): string | null;
  write(text: string): void;
}

/** A one-shot message about what just happened, for the paywall to say out loud. */
export type BillingNotice = 'restored' | 'nothing-to-restore' | 'purchase-pending' | null;

export interface EntitlementSnapshot {
  access: Access;
  /** The offer to show (price, trial). Null until loaded. */
  product: ProductInfo | null;
  productError: BillingErrorCode | null;
  /** What we're waiting on right now, so buttons can show progress and refuse double taps. */
  busy: 'purchase' | 'restore' | 'refresh' | null;
  /** The last thing that went wrong when the person asked for something; cleared when they try again. */
  error: BillingErrorCode | null;
  notice: BillingNotice;
  /** Whether Google Play is wired up on this device at all. */
  gateway: BillingGateway['kind'];
}

export interface EntitlementDeps {
  gateway: BillingGateway;
  storage: MemoryStorage;
  now: () => number;
  /** Don't re-check more than this often when the app merely comes back to the foreground. */
  minRecheckMs?: number;
}

type Listener = () => void;

const MIN_RECHECK_MS = 30_000;

/**
 * Keeps track of whether the person has a current subscription.
 *
 *   Google Play  →  gateway  →  decideAccess (pure rules)  →  snapshot  →  the app
 *
 * It re-checks when the app starts, when it returns to the foreground (people cancel or renew in the
 * Play Store app), when Play reports a change, and every few hours while open. Refreshes never overlap.
 */
export class EntitlementStore {
  private cache: EntitlementCache | null;
  private verification: Verification | null = null;
  private snapshot: EntitlementSnapshot;
  private readonly listeners = new Set<Listener>();
  private inFlight: Promise<void> | null = null;
  private rerun = false;
  private lastRefreshAt = Number.NEGATIVE_INFINITY;
  private teardown: (() => void) | null = null;

  constructor(private readonly deps: EntitlementDeps) {
    this.cache = parseCache(this.safeRead());
    this.snapshot = {
      access: decideAccess({ verification: null, cache: this.cache, now: deps.now() }),
      product: null,
      productError: null,
      busy: null,
      error: null,
      notice: null,
      gateway: deps.gateway.kind,
    };
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): EntitlementSnapshot => this.snapshot;

  /**
   * Runs the first check and starts watching for changes. Safe to call once; returns when the first check is done.
   * Someone who will see the paywall also gets the offer loaded now, so its headline doesn't change under them.
   */
  async start(): Promise<void> {
    if (!this.teardown) this.teardown = this.watch();
    await this.refresh();
    if (this.snapshot.access.status === 'inactive') await this.loadProduct();
  }

  stop(): void {
    this.teardown?.();
    this.teardown = null;
  }

  /** Asks Google Play what the person currently has. Concurrent calls share one round trip (plus one follow-up). */
  refresh(): Promise<void> {
    if (this.inFlight) {
      this.rerun = true;
      return this.inFlight;
    }
    this.inFlight = (async () => {
      try {
        do {
          this.rerun = false;
          await this.verify();
        } while (this.rerun);
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  /** Loads the price and trial for the paywall. Failure is recorded, not thrown. */
  async loadProduct(): Promise<void> {
    if (this.deps.gateway.kind === 'none') return;
    try {
      const product = await this.deps.gateway.getProduct();
      this.set({ product, productError: null });
    } catch (error) {
      this.set({ product: null, productError: codeOf(error) });
    }
  }

  /** Starts the Google Play purchase flow. The outcome arrives through the snapshot (access, notice, error). */
  async purchase(): Promise<void> {
    if (this.snapshot.busy) return;
    this.set({ busy: 'purchase', error: null, notice: null });
    try {
      if (!this.snapshot.product) await this.loadProduct();
      const product = this.snapshot.product;
      if (!product) {
        this.set({ busy: null, error: this.snapshot.productError ?? 'item-unavailable' });
        return;
      }
      const outcome = await this.deps.gateway.purchase(product.offerToken);
      if (outcome === 'pending') this.set({ notice: 'purchase-pending' });
      // Whatever happened, Google Play is the one to ask: it knows if the payment really went through.
      await this.refresh();
    } catch (error) {
      this.set({ error: codeOf(error) });
    } finally {
      this.set({ busy: null });
    }
  }

  /** "Restore purchases": re-reads this Google account's purchases from Play, e.g. after a reinstall or on a new phone. */
  async restore(): Promise<void> {
    if (this.snapshot.busy) return;
    this.set({ busy: 'restore', error: null, notice: null });
    try {
      await this.refresh();
      const { access } = this.snapshot;
      if (access.entitled && !access.stale) this.set({ notice: 'restored' });
      else if (access.status === 'pending') this.set({ notice: 'purchase-pending' });
      else if (access.status === 'inactive') this.set({ notice: 'nothing-to-restore' });
      else this.set({ error: this.verification?.kind === 'failed' ? this.verification.error : 'service-unavailable' });
    } finally {
      this.set({ busy: null });
    }
  }

  async manageSubscription(): Promise<void> {
    this.set({ error: null });
    try {
      await this.deps.gateway.openManageSubscriptions();
    } catch (error) {
      this.set({ error: codeOf(error) });
    }
  }

  dismissNotice(): void {
    if (this.snapshot.notice || this.snapshot.error) this.set({ notice: null, error: null });
  }

  /* ── internals ──────────────────────────────────────────────────────────────────────────────── */

  private async verify(): Promise<void> {
    const { gateway, now } = this.deps;
    if (!this.snapshot.busy) this.set({ busy: 'refresh' });
    let verification: Verification;
    if (gateway.kind === 'none') {
      verification = { kind: 'unsupported', at: now() };
    } else {
      try {
        const purchases = await gateway.queryPurchases();
        verification = { kind: 'ok', purchases, at: now() };
        await this.acknowledgeAll(purchasesToAcknowledge(purchases).map((purchase) => purchase.purchaseToken));
      } catch (error) {
        verification = { kind: 'failed', error: codeOf(error), at: now() };
      }
    }
    this.lastRefreshAt = now();
    this.verification = verification;
    const access = decideAccess({ verification, cache: this.cache, now: now() });
    const updated = nextCache(this.cache, verification, access);
    if (updated !== this.cache) {
      this.cache = updated;
      if (updated) this.safeWrite(serializeCache(updated));
    }
    // A fresh yes makes any earlier "payment pending" notice moot.
    this.set({ access, busy: this.snapshot.busy === 'refresh' ? null : this.snapshot.busy, notice: access.entitled ? null : this.snapshot.notice });
  }

  /** Google refunds a subscription that isn't acknowledged within three days, so do it as soon as we see it. */
  private async acknowledgeAll(tokens: readonly string[]): Promise<void> {
    for (const token of tokens) {
      try {
        await this.deps.gateway.acknowledge(token);
      } catch {
        /* retried on the next check; access doesn't depend on it */
      }
    }
  }

  private watch(): () => void {
    const refreshIfDue = () => {
      if (this.deps.now() - this.lastRefreshAt >= (this.deps.minRecheckMs ?? MIN_RECHECK_MS)) void this.refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshIfDue();
    };
    document.addEventListener('visibilitychange', onVisible);
    const unlisten = this.deps.gateway.onPurchasesChanged(() => void this.refresh());
    const timer = window.setInterval(() => void this.refresh(), RECHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      unlisten();
      window.clearInterval(timer);
    };
  }

  private set(patch: Partial<EntitlementSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private safeRead(): string | null {
    try {
      return this.deps.storage.read();
    } catch {
      return null;
    }
  }

  private safeWrite(text: string): void {
    try {
      this.deps.storage.write(text);
    } catch {
      /* the memory only helps when offline; losing it is harmless */
    }
  }
}

function codeOf(error: unknown): BillingErrorCode {
  return error instanceof BillingError ? error.code : 'unknown';
}
