import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockGateway, DEFAULT_MOCK_STATE, MOCK_STORAGE_KEY, type MockBillingState } from './mockGateway';
import { EntitlementStore, type MemoryStorage } from './store';
import { serializeCache } from './entitlement';
import { OFFLINE_GRACE_MS, SUBSCRIPTION_PRODUCT_ID, type PlayPurchase } from './types';

const T0 = Date.parse('2026-10-02T12:00:00Z');
const HOUR = 60 * 60 * 1000;

/** A throwaway "device": a mock Google Play, a memory for the last check, and a clock we control. */
function setup(initial: Partial<MockBillingState> = {}, memory: string | null = null) {
  const mockStorage = new Map<string, string>();
  mockStorage.set(MOCK_STORAGE_KEY, JSON.stringify({ ...DEFAULT_MOCK_STATE, ...initial }));
  let clock = T0;
  let remembered = memory;
  const storage: MemoryStorage = { read: () => remembered, write: (text) => void (remembered = text) };
  const gateway = createMockGateway({ getItem: (k) => mockStorage.get(k) ?? null, setItem: (k, v) => void mockStorage.set(k, v) }, () => clock);
  const store = new EntitlementStore({ gateway, storage, now: () => clock, minRecheckMs: 1000 });
  const play = (): MockBillingState => JSON.parse(mockStorage.get(MOCK_STORAGE_KEY)!) as MockBillingState;
  const setPlay = (patch: Partial<MockBillingState>) => mockStorage.set(MOCK_STORAGE_KEY, JSON.stringify({ ...play(), ...patch }));
  return {
    store,
    play,
    setPlay,
    memory: () => remembered,
    advance: (ms: number) => void (clock += ms),
    gateway,
  };
}

const sub = (overrides: Partial<PlayPurchase> = {}): PlayPurchase => ({
  productId: SUBSCRIPTION_PRODUCT_ID,
  purchaseToken: 'tok-1',
  purchaseTimeMs: T0 - HOUR,
  state: 'purchased',
  autoRenewing: true,
  acknowledged: true,
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe('the first check', () => {
  it('a new person is locked, and the paywall can show the trial', async () => {
    const { store } = setup();
    await store.start();
    await store.loadProduct();
    expect(store.getSnapshot().access).toMatchObject({ status: 'inactive', entitled: false, lapsed: false });
    expect(store.getSnapshot().product).toEqual({ formattedPrice: '€2.99', trialDays: 7, offerToken: 'mock-offer' });
    store.stop();
  });

  it('a subscriber is let in, and the answer is remembered without any secret in it', async () => {
    const { store, memory } = setup({ purchases: [sub()] });
    await store.start();
    expect(store.getSnapshot().access).toMatchObject({ status: 'active', entitled: true, stale: false });
    expect(memory()).toContain('"lastStatus":"active"');
    expect(memory()).not.toContain('tok-1');
    store.stop();
  });

  it('acknowledges a new purchase right away (Google refunds those it never hears back about)', async () => {
    const { store, play } = setup({ purchases: [sub({ acknowledged: false })] });
    await store.start();
    expect(play().purchases[0]!.acknowledged).toBe(true);
    store.stop();
  });

  it('a failure to acknowledge does not lock anyone out', async () => {
    const { store, gateway } = setup({ purchases: [sub({ acknowledged: false })] });
    vi.spyOn(gateway, 'acknowledge').mockRejectedValue(new Error('offline'));
    await store.start();
    expect(store.getSnapshot().access.entitled).toBe(true);
    store.stop();
  });
});

describe('starting a subscription', () => {
  it('buying unlocks the app and uses up the free trial', async () => {
    const { store, play } = setup();
    await store.start();
    await store.loadProduct();
    await store.purchase();
    expect(store.getSnapshot()).toMatchObject({ access: { status: 'active', entitled: true }, busy: null, error: null });
    expect(play().purchases).toHaveLength(1);
    expect(play().purchases[0]!.acknowledged).toBe(true);
    await store.loadProduct();
    expect(store.getSnapshot().product!.trialDays).toBeNull(); // the trial is once per account
    store.stop();
  });

  it('closing the payment sheet changes nothing and shows no error', async () => {
    const { store } = setup({ purchaseResult: 'cancelled' });
    await store.start();
    await store.purchase();
    expect(store.getSnapshot()).toMatchObject({ access: { status: 'inactive', entitled: false }, error: null, notice: null, busy: null });
    store.stop();
  });

  it('a payment that is still pending gives no access, says so, and unlocks once it completes', async () => {
    const { store, play, setPlay } = setup({ purchaseResult: 'pending' });
    await store.start();
    await store.purchase();
    expect(store.getSnapshot()).toMatchObject({ access: { status: 'pending', entitled: false }, notice: 'purchase-pending' });

    setPlay({ purchases: play().purchases.map((p) => ({ ...p, state: 'purchased' })) });
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({ access: { status: 'active', entitled: true }, notice: null });
    store.stop();
  });

  it.each(['service-unavailable', 'billing-unavailable', 'item-unavailable', 'developer-error'] as const)(
    'a Google Play problem (%s) is reported, not swallowed, and nothing is unlocked',
    async (code) => {
      const { store } = setup({ fail: { purchase: code } });
      await store.start();
      await store.purchase();
      expect(store.getSnapshot()).toMatchObject({ error: code, busy: null, access: { entitled: false } });
      store.stop();
    },
  );

  it('cannot start a second purchase while one is running', async () => {
    const { store, gateway } = setup({ delayMs: 5 });
    const spy = vi.spyOn(gateway, 'purchase');
    await store.start();
    await store.loadProduct();
    await Promise.all([store.purchase(), store.purchase()]);
    expect(spy).toHaveBeenCalledTimes(1);
    store.stop();
  });

  it('reports a missing offer instead of crashing when the product cannot be loaded', async () => {
    const { store } = setup({ fail: { product: 'item-unavailable' } });
    await store.start();
    await store.purchase();
    expect(store.getSnapshot()).toMatchObject({ error: 'item-unavailable', access: { entitled: false } });
    store.stop();
  });
});

describe('cancellations, renewals and endings', () => {
  it('cancelling keeps access until Google stops listing the subscription — then the app locks', async () => {
    const { store, setPlay } = setup({ purchases: [sub()] });
    await store.start();
    expect(store.getSnapshot().access.status).toBe('active');

    setPlay({ purchases: [sub({ autoRenewing: false })] }); // cancelled in the Play Store
    await store.refresh();
    expect(store.getSnapshot().access).toMatchObject({ status: 'active-ending', entitled: true });

    setPlay({ purchases: [] }); // the paid period ran out
    await store.refresh();
    expect(store.getSnapshot().access).toMatchObject({ status: 'inactive', entitled: false, lapsed: true });
    store.stop();
  });

  it('resubscribing after a cancellation is picked up as active again', async () => {
    const { store, setPlay } = setup({ purchases: [sub({ autoRenewing: false })] });
    await store.start();
    setPlay({ purchases: [sub({ autoRenewing: true })] });
    await store.refresh();
    expect(store.getSnapshot().access.status).toBe('active');
    store.stop();
  });

  it('a failed renewal payment: still listed during the grace period, gone once the account hold begins', async () => {
    const { store, setPlay } = setup({ purchases: [sub()] });
    await store.start();
    setPlay({ purchases: [sub()] }); // grace period: Play keeps listing it
    await store.refresh();
    expect(store.getSnapshot().access.entitled).toBe(true);
    setPlay({ purchases: [] }); // account hold: Play stops listing it
    await store.refresh();
    expect(store.getSnapshot().access).toMatchObject({ entitled: false, lapsed: true });
    store.stop();
  });

  it('a refund (purchase disappears) locks the app at the next check', async () => {
    const { store, setPlay } = setup({ purchases: [sub()] });
    await store.start();
    setPlay({ purchases: [] });
    await store.refresh();
    expect(store.getSnapshot().access.entitled).toBe(false);
    store.stop();
  });
});

describe('restoring purchases', () => {
  it('finds the subscription on a new phone or after a reinstall', async () => {
    const { store, setPlay } = setup();
    await store.start();
    expect(store.getSnapshot().access.entitled).toBe(false);
    setPlay({ purchases: [sub()] }); // the same Google account is signed in on this phone
    await store.restore();
    expect(store.getSnapshot()).toMatchObject({ access: { status: 'active', entitled: true }, notice: 'restored', busy: null });
    store.stop();
  });

  it('says plainly when this Google account has nothing to restore', async () => {
    const { store } = setup();
    await store.start();
    await store.restore();
    expect(store.getSnapshot()).toMatchObject({ access: { entitled: false }, notice: 'nothing-to-restore', error: null });
    store.stop();
  });

  it('reports a connection problem instead of claiming there is nothing to restore', async () => {
    const { store } = setup({ fail: { query: 'service-unavailable' } });
    await store.start();
    await store.restore();
    expect(store.getSnapshot()).toMatchObject({ notice: null, error: 'service-unavailable' });
    store.stop();
  });
});

describe('when Google Play cannot be reached', () => {
  const remembered = (ageMs: number) => serializeCache({ lastVerifiedAt: T0 - ageMs, lastStatus: 'active', everEntitled: true });

  it('a subscriber who verified recently stays in, marked as stale', async () => {
    const { store } = setup({ fail: { query: 'service-unavailable' } }, remembered(2 * 24 * HOUR));
    await store.start();
    expect(store.getSnapshot().access).toMatchObject({ status: 'active', entitled: true, stale: true });
    store.stop();
  });

  it('once the 72-hour grace period is over the app asks to reconnect — it does not claim the subscription ended', async () => {
    const { store } = setup({ fail: { query: 'service-unavailable' } }, remembered(OFFLINE_GRACE_MS + HOUR));
    await store.start();
    expect(store.getSnapshot().access).toMatchObject({ status: 'unverified', entitled: false });
    store.stop();
  });

  it('opens straight into the app for a recent subscriber, before the first check even returns', () => {
    const { store } = setup({ delayMs: 50 }, remembered(HOUR));
    expect(store.getSnapshot().access).toMatchObject({ entitled: true, stale: true });
  });

  it('coming back online restores a proper answer', async () => {
    const { store, setPlay } = setup({ fail: { query: 'service-unavailable' } }, remembered(HOUR));
    await store.start();
    expect(store.getSnapshot().access.stale).toBe(true);
    setPlay({ fail: {}, purchases: [] });
    await store.refresh();
    expect(store.getSnapshot().access).toMatchObject({ status: 'inactive', entitled: false, stale: false });
    store.stop();
  });
});

describe('re-checking', () => {
  it('re-checks when the app returns to the foreground, but not more often than the minimum', async () => {
    const { store, setPlay, advance } = setup({ purchases: [sub()] });
    await store.start();
    setPlay({ purchases: [] });

    document.dispatchEvent(new Event('visibilitychange')); // too soon: nothing happens
    await Promise.resolve();
    expect(store.getSnapshot().access.entitled).toBe(true);

    advance(5000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(store.getSnapshot().access.entitled).toBe(false));
    store.stop();
  });

  it('overlapping refreshes share one round trip and then catch up once', async () => {
    const { store, gateway } = setup({ purchases: [sub()], delayMs: 5 });
    const spy = vi.spyOn(gateway, 'queryPurchases');
    await Promise.all([store.refresh(), store.refresh(), store.refresh()]);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().busy).toBeNull();
  });

  it('ignores a damaged memory', () => {
    const { store } = setup({}, '{"v":1,"lastVerifiedAt":"never"}');
    expect(store.getSnapshot().access.status).toBe('checking');
  });
});

describe('managing the subscription', () => {
  it('opens the Google Play subscription page', async () => {
    const { store, play } = setup({ purchases: [sub()] });
    await store.manageSubscription();
    expect(play().manageOpened).toBe(1);
  });
});

describe('a device without Google Play Billing', () => {
  it('stays locked and says it is unavailable — it never falls back to free', async () => {
    const store = new EntitlementStore({
      gateway: {
        kind: 'none',
        getProduct: () => Promise.reject(new Error('n/a')),
        queryPurchases: () => Promise.resolve([]),
        purchase: () => Promise.reject(new Error('n/a')),
        acknowledge: () => Promise.resolve(),
        openManageSubscriptions: () => Promise.resolve(),
        onPurchasesChanged: () => () => undefined,
      },
      storage: { read: () => serializeCache({ lastVerifiedAt: T0, lastStatus: 'active', everEntitled: true }), write: () => undefined },
      now: () => T0,
    });
    await store.start();
    expect(store.getSnapshot().access).toMatchObject({ status: 'unavailable', entitled: false });
    store.stop();
  });
});
