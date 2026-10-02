import { describe, expect, it } from 'vitest';
import { decideAccess, nextCache, parseCache, parseTrialDays, purchasesToAcknowledge, resolvePurchases, serializeCache, touchCache } from './entitlement';
import { OFFLINE_GRACE_MS, SUBSCRIPTION_PRODUCT_ID, type EntitlementCache, type PlayPurchase, type Verification } from './types';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const HOUR = 60 * 60 * 1000;

const purchase = (overrides: Partial<PlayPurchase> = {}): PlayPurchase => ({
  productId: SUBSCRIPTION_PRODUCT_ID,
  purchaseToken: 'secret-token',
  purchaseTimeMs: NOW - 24 * HOUR,
  state: 'purchased',
  autoRenewing: true,
  acknowledged: true,
  ...overrides,
});

const ok = (purchases: PlayPurchase[], at = NOW): Verification => ({ kind: 'ok', purchases, at });
const failed = (at = NOW): Verification => ({ kind: 'failed', error: 'service-unavailable', at });
const cache = (overrides: Partial<EntitlementCache> = {}): EntitlementCache => ({
  lastVerifiedAt: NOW - HOUR,
  lastStatus: 'active',
  everEntitled: true,
  seenAt: NOW - HOUR,
  ...overrides,
});

describe('resolvePurchases — what Google Play lists decides everything', () => {
  it('a purchased, auto-renewing subscription is active (this is also how a free trial and a payment grace period look)', () => {
    expect(resolvePurchases([purchase()])).toBe('active');
  });

  it('a cancelled subscription that Play still lists stays usable until the paid period ends', () => {
    expect(resolvePurchases([purchase({ autoRenewing: false })])).toBe('active-ending');
  });

  it('a pending payment gives no access yet', () => {
    expect(resolvePurchases([purchase({ state: 'pending', acknowledged: false })])).toBe('pending');
  });

  it('nothing listed means no subscription: never started, expired, refunded, or on account hold', () => {
    expect(resolvePurchases([])).toBe('inactive');
  });

  it('ignores purchases of other products', () => {
    expect(resolvePurchases([purchase({ productId: 'something_else' })])).toBe('inactive');
  });

  it('a paid purchase beats a pending one (e.g. resubscribing while an old payment is still settling)', () => {
    expect(resolvePurchases([purchase({ state: 'pending' }), purchase({ autoRenewing: false })])).toBe('active-ending');
    expect(resolvePurchases([purchase({ state: 'pending' }), purchase()])).toBe('active');
  });
});

describe('decideAccess — a fresh answer from Google Play always wins', () => {
  it('entitled when subscribed; not entitled when not', () => {
    expect(decideAccess({ verification: ok([purchase()]), cache: null, now: NOW })).toEqual({ status: 'active', entitled: true, stale: false, lapsed: false });
    expect(decideAccess({ verification: ok([]), cache: null, now: NOW })).toEqual({ status: 'inactive', entitled: false, stale: false, lapsed: false });
  });

  it('a subscription that has ended is locked at once — even if we remember it being active a minute ago', () => {
    const access = decideAccess({ verification: ok([]), cache: cache({ lastVerifiedAt: NOW - 60_000 }), now: NOW });
    expect(access).toEqual({ status: 'inactive', entitled: false, stale: false, lapsed: true });
  });

  it('a person who never subscribed is not "lapsed"; one who did, and let it end, is', () => {
    expect(decideAccess({ verification: ok([]), cache: cache({ everEntitled: false, lastStatus: 'inactive' }), now: NOW }).lapsed).toBe(false);
    expect(decideAccess({ verification: ok([]), cache: cache({ lastStatus: 'inactive' }), now: NOW }).lapsed).toBe(true);
  });

  it('a cancelled-but-paid-up subscription keeps access and says it is ending', () => {
    const access = decideAccess({ verification: ok([purchase({ autoRenewing: false })]), cache: null, now: NOW });
    expect(access).toMatchObject({ status: 'active-ending', entitled: true });
  });

  it('a renewal is just the same subscription still being listed', () => {
    const before = decideAccess({ verification: ok([purchase({ purchaseTimeMs: NOW - 31 * 24 * HOUR })]), cache: null, now: NOW });
    const after = decideAccess({ verification: ok([purchase({ purchaseTimeMs: NOW })], NOW + 1), cache: null, now: NOW + 1 });
    expect(before.entitled && after.entitled).toBe(true);
  });

  it('pending payment is shown as pending and is not entitled', () => {
    expect(decideAccess({ verification: ok([purchase({ state: 'pending' })]), cache: null, now: NOW })).toMatchObject({ status: 'pending', entitled: false });
  });

  it('a device without Google Play Billing is never entitled by memory', () => {
    const access = decideAccess({ verification: { kind: 'unsupported', at: NOW }, cache: cache(), now: NOW });
    expect(access).toMatchObject({ status: 'unavailable', entitled: false });
  });
});

describe('decideAccess — when Google Play cannot be reached', () => {
  it('a recent "yes" keeps a paying person in (stale)', () => {
    const access = decideAccess({ verification: failed(), cache: cache({ lastVerifiedAt: NOW - 2 * 24 * HOUR }), now: NOW });
    expect(access).toEqual({ status: 'active', entitled: true, stale: true, lapsed: false });
  });

  it('keeps the remembered "ending" wording too', () => {
    const access = decideAccess({ verification: failed(), cache: cache({ lastStatus: 'active-ending' }), now: NOW });
    expect(access).toMatchObject({ status: 'active-ending', entitled: true, stale: true });
  });

  it('the grace period is exactly 72 hours', () => {
    const edge = cache({ lastVerifiedAt: NOW - OFFLINE_GRACE_MS });
    expect(decideAccess({ verification: failed(), cache: edge, now: NOW }).entitled).toBe(true);
    expect(decideAccess({ verification: failed(), cache: edge, now: NOW + 1 }).entitled).toBe(false);
  });

  it('after the grace period the answer is "could not verify", not "not subscribed"', () => {
    const access = decideAccess({ verification: failed(), cache: cache({ lastVerifiedAt: NOW - 4 * 24 * HOUR }), now: NOW });
    expect(access).toEqual({ status: 'unverified', entitled: false, stale: false, lapsed: true });
  });

  it('a remembered "no" is never turned into a "yes", and no memory means no access', () => {
    expect(decideAccess({ verification: failed(), cache: cache({ lastStatus: 'inactive' }), now: NOW }).entitled).toBe(false);
    expect(decideAccess({ verification: failed(), cache: cache({ lastStatus: 'pending' }), now: NOW }).entitled).toBe(false);
    expect(decideAccess({ verification: failed(), cache: null, now: NOW })).toMatchObject({ status: 'unverified', entitled: false });
  });

  it('turning the clock back cannot extend the grace period', () => {
    const rewound = cache({ lastVerifiedAt: NOW + 3 * 24 * HOUR });
    expect(decideAccess({ verification: failed(), cache: rewound, now: NOW }).entitled).toBe(false);
    // a few minutes of ordinary clock drift is fine
    expect(decideAccess({ verification: failed(), cache: cache({ lastVerifiedAt: NOW + 60_000 }), now: NOW }).entitled).toBe(true);
  });
});

describe('decideAccess — turning the clock back', () => {
  it('a clock found more than an hour behind the latest time already seen voids the remembered check', () => {
    const tampered = cache({ lastVerifiedAt: NOW - 2 * HOUR, seenAt: NOW + 2 * HOUR }); // the app has seen a time 2 h later than "now"
    expect(decideAccess({ verification: failed(), cache: tampered, now: NOW })).toMatchObject({ status: 'unverified', entitled: false });
    expect(decideAccess({ verification: null, cache: tampered, now: NOW }).status).toBe('checking');
  });

  it('the classic trick — an expired subscription kept alive offline by rolling the date back — no longer works', () => {
    // verified 70 h ago, then (offline) the clock was moved back to 10 h after that check, 60 h in the past
    const lastCheck = NOW - 70 * HOUR;
    const seenLater = cache({ lastVerifiedAt: lastCheck, seenAt: NOW - HOUR });
    const rolledBack = lastCheck + 10 * HOUR;
    expect(decideAccess({ verification: failed(), cache: seenLater, now: rolledBack }).entitled).toBe(false);
  });

  it('small corrections from the network time service are fine', () => {
    const slightlyBehind = cache({ seenAt: NOW + 30 * 60 * 1000 });
    expect(decideAccess({ verification: failed(), cache: slightlyBehind, now: NOW }).entitled).toBe(true);
  });

  it('a genuine answer from Google Play resets the reference, so a clock that was wrong can recover', () => {
    const wasAhead = cache({ seenAt: NOW + 10 * HOUR });
    const verification = ok([purchase()]);
    const access = decideAccess({ verification, cache: wasAhead, now: NOW });
    expect(access.entitled).toBe(true); // fresh answers always win
    expect(nextCache(wasAhead, verification, access)!.seenAt).toBe(NOW);
  });
});

describe('touchCache', () => {
  it('remembers the latest time shown by the clock, at a few minutes’ resolution, and never invents a memory', () => {
    expect(touchCache(null, NOW)).toBeNull();
    const base = cache({ seenAt: NOW });
    expect(touchCache(base, NOW + 60_000)).toBe(base); // too soon to bother
    expect(touchCache(base, NOW + 10 * 60_000)!.seenAt).toBe(NOW + 10 * 60_000);
    expect(touchCache(base, NOW - HOUR)).toBe(base); // never moves backwards
  });
});

describe('decideAccess — before the first check finishes', () => {
  it('shows "checking" when nothing is remembered', () => {
    expect(decideAccess({ verification: null, cache: null, now: NOW })).toEqual({ status: 'checking', entitled: false, stale: false, lapsed: false });
  });

  it('lets a recently verified subscriber straight in, with no flash of the paywall', () => {
    expect(decideAccess({ verification: null, cache: cache(), now: NOW })).toMatchObject({ status: 'active', entitled: true, stale: true });
  });

  it('does not trust an old memory', () => {
    expect(decideAccess({ verification: null, cache: cache({ lastVerifiedAt: NOW - 5 * 24 * HOUR }), now: NOW }).status).toBe('checking');
  });
});

describe('nextCache', () => {
  it('remembers a real answer, and that the person has been entitled', () => {
    const verification = ok([purchase()]);
    const access = decideAccess({ verification, cache: null, now: NOW });
    expect(nextCache(null, verification, access)).toEqual({ lastVerifiedAt: NOW, lastStatus: 'active', everEntitled: true, seenAt: NOW });
  });

  it('keeps "ever entitled" after the subscription ends', () => {
    const verification = ok([]);
    const previous = cache();
    expect(nextCache(previous, verification, decideAccess({ verification, cache: previous, now: NOW }))).toEqual({
      lastVerifiedAt: NOW,
      lastStatus: 'inactive',
      everEntitled: true,
      seenAt: NOW,
    });
  });

  it('failures and unsupported devices change nothing', () => {
    const previous = cache();
    expect(nextCache(previous, failed(), decideAccess({ verification: failed(), cache: previous, now: NOW }))).toBe(previous);
    expect(nextCache(null, { kind: 'unsupported', at: NOW }, { status: 'unavailable', entitled: false, stale: false, lapsed: false })).toBeNull();
  });
});

describe('the stored memory', () => {
  it('round-trips and holds nothing secret', () => {
    const stored = serializeCache(cache());
    expect(parseCache(stored)).toEqual(cache());
    expect(stored).not.toMatch(/token|secret/i);
  });

  it('reads memories written before the clock check existed, starting from their last verification', () => {
    const old = JSON.stringify({ v: 1, lastVerifiedAt: 1234, lastStatus: 'active', everEntitled: true });
    expect(parseCache(old)).toEqual({ lastVerifiedAt: 1234, lastStatus: 'active', everEntitled: true, seenAt: 1234 });
  });

  it.each([null, '', 'not json', '[]', '{"v":2}', '{"v":1,"lastVerifiedAt":"x","lastStatus":"active","everEntitled":true}', '{"v":1,"lastVerifiedAt":1,"lastStatus":"gold","everEntitled":true}', '{"v":1,"lastVerifiedAt":1,"lastStatus":"active","everEntitled":"yes"}', '{"v":1,"lastVerifiedAt":1,"lastStatus":"active","everEntitled":true,"seenAt":"later"}'])(
    'treats %j as no memory',
    (text) => {
      expect(parseCache(text)).toBeNull();
    },
  );
});

describe('purchasesToAcknowledge', () => {
  it('picks paid, unacknowledged purchases of our product — Google refunds those after three days', () => {
    const list = [
      purchase({ acknowledged: false, purchaseToken: 'a' }),
      purchase({ acknowledged: true, purchaseToken: 'b' }),
      purchase({ state: 'pending', acknowledged: false, purchaseToken: 'c' }),
      purchase({ productId: 'other', acknowledged: false, purchaseToken: 'd' }),
    ];
    expect(purchasesToAcknowledge(list).map((p) => p.purchaseToken)).toEqual(['a']);
  });
});

describe('parseTrialDays', () => {
  it.each([
    ['P7D', 7],
    ['P1W', 7],
    ['P2W', 14],
    ['P1W2D', 9],
    ['P3D', 3],
  ])('%s → %i days', (period, days) => expect(parseTrialDays(period)).toBe(days));

  it.each([null, undefined, '', 'P1M', 'P1Y', 'P0D', 'PT1H', 'nonsense'])('%j → no trial length', (period) =>
    expect(parseTrialDays(period)).toBeNull(),
  );
});
