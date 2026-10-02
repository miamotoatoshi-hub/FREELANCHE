import { describe, expect, it, vi } from 'vitest';
import { createPlayGateway, createPlaySealer, mapNativeError, toPlayPurchases, type FreelancheBillingPlugin } from './playGateway';
import { BillingError, SUBSCRIPTION_PRODUCT_ID } from './types';

function fakePlugin(overrides: Partial<FreelancheBillingPlugin> = {}): FreelancheBillingPlugin {
  return {
    getSubscriptionOffer: vi.fn().mockResolvedValue({ formattedPrice: '2,99 €', trialPeriod: 'P7D', offerToken: 'offer-1' }),
    queryPurchases: vi.fn().mockResolvedValue({ purchases: [] }),
    purchase: vi.fn().mockResolvedValue({ outcome: 'purchased' }),
    acknowledge: vi.fn().mockResolvedValue(undefined),
    openManageSubscriptions: vi.fn().mockResolvedValue(undefined),
    sign: vi.fn().mockImplementation(async ({ text }: { text: string }) => ({ mac: `mac(${text})` })),
    verify: vi.fn().mockImplementation(async ({ text, mac }: { text: string; mac: string }) => ({ valid: mac === `mac(${text})` })),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) }),
    ...overrides,
  };
}

describe('mapNativeError', () => {
  it.each([
    ['BILLING_UNAVAILABLE', 'billing-unavailable'],
    ['FEATURE_NOT_SUPPORTED', 'billing-unavailable'],
    ['UNIMPLEMENTED', 'billing-unavailable'],
    ['SERVICE_UNAVAILABLE', 'service-unavailable'],
    ['SERVICE_DISCONNECTED', 'service-unavailable'],
    ['NETWORK_ERROR', 'service-unavailable'],
    ['ITEM_UNAVAILABLE', 'item-unavailable'],
    ['NO_OFFER', 'item-unavailable'],
    ['DEVELOPER_ERROR', 'developer-error'],
    ['SOMETHING_NEW', 'unknown'],
  ])('%s → %s', (code, expected) => {
    expect(mapNativeError({ code, message: 'm' }).code).toBe(expected);
  });

  it('keeps our own errors and tolerates junk', () => {
    const own = new BillingError('item-unavailable');
    expect(mapNativeError(own)).toBe(own);
    expect(mapNativeError(null).code).toBe('unknown');
    expect(mapNativeError('boom').code).toBe('unknown');
  });
});

describe('toPlayPurchases', () => {
  it('maps fields, and drops purchases whose state Google could not tell us', () => {
    const list = toPlayPurchases([
      { productId: 'p', purchaseToken: 't1', purchaseTime: 123, purchaseState: 'purchased', autoRenewing: true, acknowledged: false },
      { productId: 'p', purchaseToken: 't2', purchaseTime: 124, purchaseState: 'pending', autoRenewing: false, acknowledged: false },
      { productId: 'p', purchaseToken: 't3', purchaseTime: 125, purchaseState: 'unspecified', autoRenewing: true, acknowledged: true },
    ]);
    expect(list).toEqual([
      { productId: 'p', purchaseToken: 't1', purchaseTimeMs: 123, state: 'purchased', autoRenewing: true, acknowledged: false },
      { productId: 'p', purchaseToken: 't2', purchaseTimeMs: 124, state: 'pending', autoRenewing: false, acknowledged: false },
    ]);
  });
});

describe('purchases Google did not sign', () => {
  const base = { productId: 'freelanche_premium', purchaseToken: 't', purchaseTime: 1, purchaseState: 'purchased' as const, autoRenewing: true, acknowledged: true };

  it('are dropped as if never listed — a fake Play Store cannot hand out a subscription', () => {
    expect(toPlayPurchases([{ ...base, signatureValid: false }])).toEqual([]);
  });

  it('keep genuine purchases, and accept builds that have no licence key to check against (debug only)', () => {
    expect(toPlayPurchases([{ ...base, signatureValid: true }])).toHaveLength(1);
    expect(toPlayPurchases([{ ...base, signatureValid: null }])).toHaveLength(1);
    expect(toPlayPurchases([base])).toHaveLength(1);
  });

  it('end to end: a forged purchase leaves the gateway reporting no subscription', async () => {
    const plugin = fakePlugin({ queryPurchases: vi.fn().mockResolvedValue({ purchases: [{ ...base, signatureValid: false }] }) });
    await expect(createPlayGateway(plugin).queryPurchases()).resolves.toEqual([]);
  });
});

describe('the Keystore stamp', () => {
  it('signs and verifies through the native plugin', async () => {
    const sealer = createPlaySealer(fakePlugin());
    const mac = await sealer.sign('hello');
    await expect(sealer.verify('hello', mac)).resolves.toBe(true);
    await expect(sealer.verify('hello!', mac)).resolves.toBe(false);
  });
});

describe('the Play gateway', () => {
  it('turns the native offer into price and trial days — the price comes from Google, not from us', async () => {
    const plugin = fakePlugin();
    await expect(createPlayGateway(plugin).getProduct()).resolves.toEqual({ formattedPrice: '2,99 €', trialDays: 7, offerToken: 'offer-1' });
    expect(plugin.getSubscriptionOffer).toHaveBeenCalledWith({ productId: SUBSCRIPTION_PRODUCT_ID });
  });

  it('reports no trial when Google offers none (already used)', async () => {
    const plugin = fakePlugin({ getSubscriptionOffer: vi.fn().mockResolvedValue({ formattedPrice: '€2.99', trialPeriod: null, offerToken: 'o' }) });
    expect((await createPlayGateway(plugin).getProduct()).trialDays).toBeNull();
  });

  it('wraps native failures in BillingError with a friendly code', async () => {
    const plugin = fakePlugin({ queryPurchases: vi.fn().mockRejectedValue({ code: 'SERVICE_UNAVAILABLE', message: 'x' }) });
    await expect(createPlayGateway(plugin).queryPurchases()).rejects.toMatchObject({ name: 'BillingError', code: 'service-unavailable' });
  });

  it('treats "already owned" as a successful purchase so the follow-up check can unlock the app', async () => {
    const plugin = fakePlugin({ purchase: vi.fn().mockRejectedValue({ code: 'ITEM_ALREADY_OWNED' }) });
    await expect(createPlayGateway(plugin).purchase('o')).resolves.toBe('purchased');
  });

  it('passes the chosen offer to the payment sheet and returns its outcome', async () => {
    const plugin = fakePlugin({ purchase: vi.fn().mockResolvedValue({ outcome: 'cancelled' }) });
    await expect(createPlayGateway(plugin).purchase('offer-1')).resolves.toBe('cancelled');
    expect(plugin.purchase).toHaveBeenCalledWith({ productId: SUBSCRIPTION_PRODUCT_ID, offerToken: 'offer-1' });
  });

  it('gives up on a Google Play that never answers', async () => {
    vi.useFakeTimers();
    try {
      const plugin = fakePlugin({ queryPurchases: vi.fn(() => new Promise<never>(() => undefined)) });
      const result = createPlayGateway(plugin).queryPurchases();
      const assertion = expect(result).rejects.toMatchObject({ code: 'service-unavailable' });
      await vi.advanceTimersByTimeAsync(13_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives a plugin that cannot register listeners', async () => {
    const plugin = fakePlugin({ addListener: vi.fn().mockRejectedValue(new Error('not implemented')) });
    const stop = createPlayGateway(plugin).onPurchasesChanged(() => undefined);
    await Promise.resolve();
    expect(() => stop()).not.toThrow();
  });

  it('removes its listener, even if removal is requested before Google Play finished registering it', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const plugin = fakePlugin({ addListener: vi.fn().mockResolvedValue({ remove }) });
    const stop = createPlayGateway(plugin).onPurchasesChanged(() => undefined);
    stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
