import {
  CLOCK_ROLLBACK_TOLERANCE_MS,
  OFFLINE_GRACE_MS,
  SUBSCRIPTION_PRODUCT_ID,
  type Access,
  type AccessStatus,
  type EntitlementCache,
  type PlayPurchase,
  type Verification,
} from './types';

/**
 * The rules of access, as pure functions. Google Play is the source of truth: it stops listing a
 * subscription once it has really ended (expired, refunded, or payment failed past the grace
 * period), and keeps listing it during a free trial, a paid period, a cancelled-but-paid-up
 * period and a payment grace period. So "is it listed?" is the whole question.
 */

const ENTITLED: ReadonlySet<AccessStatus> = new Set(['active', 'active-ending']);

export const isEntitledStatus = (status: AccessStatus): boolean => ENTITLED.has(status);

/** Reduces a list of purchases to the status of *our* subscription. Entitled beats pending beats nothing. */
export function resolvePurchases(
  purchases: readonly PlayPurchase[],
  productId: string = SUBSCRIPTION_PRODUCT_ID,
): 'active' | 'active-ending' | 'pending' | 'inactive' {
  const ours = purchases.filter((purchase) => purchase.productId === productId);
  const paid = ours.filter((purchase) => purchase.state === 'purchased');
  if (paid.some((purchase) => purchase.autoRenewing)) return 'active';
  if (paid.length > 0) return 'active-ending';
  if (ours.some((purchase) => purchase.state === 'pending')) return 'pending';
  return 'inactive';
}

/** The purchases Google will refund if we don't acknowledge them. */
export function purchasesToAcknowledge(
  purchases: readonly PlayPurchase[],
  productId: string = SUBSCRIPTION_PRODUCT_ID,
): PlayPurchase[] {
  return purchases.filter((purchase) => purchase.productId === productId && purchase.state === 'purchased' && !purchase.acknowledged);
}

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Is a remembered check recent enough to rely on? Two clock tricks are refused: a check that appears to come from
 * the future, and a clock that has been turned back behind the latest time this app has already seen (which would
 * otherwise let an expired subscription live on while offline).
 */
function isFresh(cache: EntitlementCache, now: number): boolean {
  const age = now - cache.lastVerifiedAt;
  if (age < -MAX_CLOCK_SKEW_MS || age > OFFLINE_GRACE_MS) return false;
  return now >= cache.seenAt - CLOCK_ROLLBACK_TOLERANCE_MS;
}


const entitledByMemory = (cache: EntitlementCache | null, now: number): cache is EntitlementCache =>
  cache !== null && isEntitledStatus(cache.lastStatus) && isFresh(cache, now);

/**
 * What the person may do right now.
 *
 * - A fresh answer from Google Play always wins, in both directions.
 * - If Google Play can't be reached, a recent "yes" is honoured for a few days (so a paying person on a
 *   plane isn't locked out) — but a "no", or no memory at all, is never turned into a "yes".
 * - Until the first check finishes, a recent "yes" is also honoured, so paying people don't see a flash of paywall.
 */
export function decideAccess(input: { verification: Verification | null; cache: EntitlementCache | null; now: number }): Access {
  const { verification, cache, now } = input;
  const lapsedBefore = cache?.everEntitled ?? false;

  if (verification === null) {
    if (entitledByMemory(cache, now)) return { status: cache.lastStatus, entitled: true, stale: true, lapsed: false };
    return { status: 'checking', entitled: false, stale: false, lapsed: false };
  }

  switch (verification.kind) {
    case 'ok': {
      const status = resolvePurchases(verification.purchases);
      const entitled = isEntitledStatus(status);
      return { status, entitled, stale: false, lapsed: !entitled && lapsedBefore };
    }
    case 'unsupported':
      return { status: 'unavailable', entitled: false, stale: false, lapsed: false };
    case 'failed':
      if (entitledByMemory(cache, now)) return { status: cache.lastStatus, entitled: true, stale: true, lapsed: false };
      return { status: 'unverified', entitled: false, stale: false, lapsed: lapsedBefore };
  }
}

/** Only a real answer from Google Play updates the memory; failures leave it exactly as it was. */
export function nextCache(cache: EntitlementCache | null, verification: Verification, access: Access): EntitlementCache | null {
  if (verification.kind !== 'ok') return cache;
  return {
    lastVerifiedAt: verification.at,
    lastStatus: access.status,
    everEntitled: (cache?.everEntitled ?? false) || access.entitled,
    // A real answer from Google Play, received now, is the new reference point for the clock.
    seenAt: verification.at,
  };
}

/** Notes the latest time the clock has shown, without ever inventing a memory that was not there. */
export function touchCache(cache: EntitlementCache | null, now: number): EntitlementCache | null {
  if (!cache || now <= cache.seenAt + TOUCH_STEP_MS) return cache;
  return { ...cache, seenAt: now };
}

/** Writing the memory on every tick would be wasteful; a few minutes' resolution is plenty. */
const TOUCH_STEP_MS = 5 * 60 * 1000;

/* ── the remembered check, as stored ───────────────────────────────────────────────────────────── */

const STATUSES: readonly AccessStatus[] = ['checking', 'active', 'active-ending', 'pending', 'inactive', 'unverified', 'unavailable'];

export function serializeCache(cache: EntitlementCache): string {
  return JSON.stringify({ v: 1, ...cache });
}

/** Reads the stored memory defensively; anything unexpected is treated as "no memory". */
export function parseCache(text: string | null): EntitlementCache | null {
  if (!text) return null;
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return null;
    const { v, lastVerifiedAt, lastStatus, everEntitled, seenAt } = raw as Record<string, unknown>;
    if (v !== 1) return null;
    if (typeof lastVerifiedAt !== 'number' || !Number.isFinite(lastVerifiedAt)) return null;
    if (typeof lastStatus !== 'string' || !STATUSES.includes(lastStatus as AccessStatus)) return null;
    if (typeof everEntitled !== 'boolean') return null;
    if (seenAt !== undefined && (typeof seenAt !== 'number' || !Number.isFinite(seenAt))) return null;
    // Memories written before the clock check existed simply start from the time of their last verification.
    return { lastVerifiedAt, lastStatus: lastStatus as AccessStatus, everEntitled, seenAt: seenAt ?? lastVerifiedAt };
  } catch {
    return null;
  }
}

/** "P7D" → 7, "P1W" → 7. Months and years aren't a trial length we'd ever promise in days. */
export function parseTrialDays(isoPeriod: string | null | undefined): number | null {
  if (!isoPeriod) return null;
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?$/.exec(isoPeriod);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const days = Number(match[1] ?? 0) * 7 + Number(match[2] ?? 0);
  return days > 0 ? days : null;
}
