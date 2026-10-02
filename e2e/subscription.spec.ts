import { expect, test, type Page } from '@playwright/test';
import { dict, freezeClock, goTo, playState, seed, setPlay, storedData } from './helpers';

/**
 * The subscription lifecycle in a real browser, against a pretend Google Play (the "mock" build):
 * no free tier, free trial, renewal, cancellation, expiry, failed payment, restore, offline.
 */

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

const ENTRIES = [
  { date: '2026-09-02', amount: 500, note: 'Logo' },
  { date: '2026-09-10', amount: 250 },
];

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });
const ACTIVE_PURCHASE = { productId: 'freelanche_premium', purchaseToken: 'e2e', purchaseTimeMs: 1, state: 'purchased', autoRenewing: true, acknowledged: true };

test.describe('no free tier', () => {
  test('without a subscription only the paywall opens — every route, even by address', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'none' });
    await page.goto('/');
    await expect(title(page)).toHaveText('Start your free trial');
    await expect(nav(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add income' })).toHaveCount(0);
    for (const route of ['#/history', '#/insights', '#/settings']) {
      await page.goto(`/${route}`);
      await expect(title(page)).toHaveText('Start your free trial');
      await expect(nav(page)).toHaveCount(0);
    }
  });

  test('the offer is spelled out before any money is asked for', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'none' });
    await page.goto('/');
    await expect(page.getByText('7 days free')).toBeVisible();
    await expect(page.getByText('then €2.99 per month')).toBeVisible();
    await expect(page.locator('.paywall__terms')).toContainText('renews automatically each month until you cancel');
    await expect(page.locator('.paywall__terms')).toContainText("cancel before the trial ends and you won't be charged");
    await expect(page.getByRole('button', { name: 'Restore purchases' })).toBeVisible();
  });

  test('a locked person can still take their data with them, or erase it', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'none' });
    await page.goto('/');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export data' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^freelanche-income-.*\.csv$/);

    await page.getByRole('button', { name: 'Delete all data' }).click();
    await page.getByRole('button', { name: 'Delete all' }).click();
    await expect(title(page)).toHaveText('What language would you like to use in the app?');
    expect((await storedData(page))?.entries ?? []).toHaveLength(0);
  });
});

test.describe('free trial and subscribing', () => {
  test('starting the trial unlocks the app, keeps the data, and the purchase is acknowledged', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'none' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Start free trial' }).click();
    await expect(nav(page)).toBeVisible();
    await expect(page.locator('.ring__center')).toContainText('750');
    const play = await playState(page);
    expect(play.purchases).toHaveLength(1);
    expect(play.purchases[0]).toMatchObject({ acknowledged: true, autoRenewing: true, state: 'purchased' });
  });

  test('the subscription survives a restart', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'none' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Start free trial' }).click();
    await expect(nav(page)).toBeVisible();
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Start your free trial' })).toHaveCount(0);
  });

  test('once the trial is used, the offer no longer promises one', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'none' });
    await page.goto('/');
    await setPlay(page, { trialUsed: true });
    await page.reload();
    await expect(title(page)).toHaveText('Subscribe to Freelanche');
    await expect(page.getByText(/days? free/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Subscribe', exact: true })).toBeVisible();
  });

  test('closing the payment sheet changes nothing', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'none' });
    await page.goto('/');
    await setPlay(page, { purchaseResult: 'cancelled' });
    await page.getByRole('button', { name: 'Start free trial' }).click();
    await expect(title(page)).toHaveText('Start your free trial');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await playState(page)).purchases).toHaveLength(0);
  });

  test('a Google Play error is explained and nothing is unlocked', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'none' });
    await page.goto('/');
    await setPlay(page, { fail: { purchase: 'service-unavailable' } });
    await page.getByRole('button', { name: 'Start free trial' }).click();
    await expect(page.getByRole('alert')).toContainText("Couldn't reach Google Play");
    await expect(nav(page)).toHaveCount(0);
  });

  test('a pending payment gives no access until Google confirms it', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'none' });
    await page.goto('/');
    await setPlay(page, { purchaseResult: 'pending' });
    await page.getByRole('button', { name: 'Start free trial' }).click();
    await expect(title(page)).toHaveText('Waiting for your payment');
    await expect(nav(page)).toHaveCount(0);

    // Google confirms the payment
    const state = await playState(page);
    await setPlay(page, { purchases: state.purchases.map((p) => ({ ...p, state: 'purchased' })) });
    await expect(nav(page)).toBeVisible();
  });
});

test.describe('cancellation, expiry and renewal', () => {
  test('a cancelled subscription works until the period ends, then the app locks — data intact', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'active' });
    await page.goto('/');
    await expect(nav(page)).toBeVisible();

    await setPlay(page, { purchases: [{ ...ACTIVE_PURCHASE, autoRenewing: false }] }); // cancelled in the Play Store
    await goTo(page, 'Settings');
    await expect(page.getByText('Cancelled — active until the end of the paid period')).toBeVisible();
    await expect(nav(page)).toBeVisible();

    await setPlay(page, { purchases: [] }); // the paid period is over
    await expect(title(page)).toHaveText('Your subscription has ended');
    await expect(page.getByText(/Your income data is safe on this device/)).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
    expect((await storedData(page)).entries).toHaveLength(2);
  });

  test('a failed renewal: still usable in the grace period, locked once Google puts the account on hold', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'active' });
    await page.goto('/');
    await setPlay(page, { purchases: [ACTIVE_PURCHASE] }); // grace period: Play keeps listing it
    await expect(nav(page)).toBeVisible();
    await setPlay(page, { purchases: [] }); // account hold
    await expect(title(page)).toHaveText('Your subscription has ended');
    await setPlay(page, { purchases: [ACTIVE_PURCHASE] }); // payment fixed
    await expect(nav(page)).toBeVisible();
  });

  test('coming back to the app re-checks the subscription', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'active' });
    await page.goto('/');
    await expect(nav(page)).toBeVisible();
    // changed while the app was in the background: no event, just a return to the foreground
    await page.evaluate(() => {
      const state = JSON.parse(window.localStorage.getItem('freelanche-mock:billing')!) as Record<string, unknown>;
      window.localStorage.setItem('freelanche-mock:billing', JSON.stringify({ ...state, purchases: [] }));
    });
    await page.clock.setFixedTime(new Date('2026-09-15T12:05:00')); // a few minutes later
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(title(page)).toHaveText('Your subscription has ended');
  });
});

test.describe('restoring purchases', () => {
  test('finds the subscription of this Google account', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'none' });
    await page.goto('/');
    await page.evaluate((purchase) => {
      const state = JSON.parse(window.localStorage.getItem('freelanche-mock:billing')!) as Record<string, unknown>;
      window.localStorage.setItem('freelanche-mock:billing', JSON.stringify({ ...state, purchases: [purchase] }));
    }, ACTIVE_PURCHASE);
    await page.getByRole('button', { name: 'Restore purchases' }).click();
    await expect(nav(page)).toBeVisible();
  });

  test('says so plainly when there is nothing to restore', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'none' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Restore purchases' }).click();
    await expect(page.getByText('No active subscription was found for this Google account.')).toBeVisible();
  });

  test('Settings can restore and manage the subscription', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'active' });
    await page.goto('/');
    await goTo(page, 'Settings');
    await page.getByRole('button', { name: /Manage subscription/ }).click();
    await expect.poll(async () => (await playState(page)).manageOpened).toBe(1);
    await page.getByRole('button', { name: 'Restore purchases' }).click();
    await expect(page.getByText('Subscription restored. Welcome back!')).toBeVisible();
  });
});

test.describe('when Google Play cannot be reached', () => {
  test('a subscriber who checked recently is not locked out; the app says what it is relying on', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'active' });
    await page.goto('/');
    await expect(nav(page)).toBeVisible(); // first check succeeded and was remembered
    await setPlay(page, { fail: { query: 'service-unavailable' } });
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await goTo(page, 'Settings');
    await expect(page.getByText("Couldn't reach Google Play — showing your last check")).toBeVisible();
  });

  test('after the 72-hour grace period the app asks to reconnect instead of staying open', async ({ page }) => {
    await seed(page, { entries: ENTRIES, subscription: 'active' });
    await page.goto('/');
    await expect(nav(page)).toBeVisible();
    await setPlay(page, { fail: { query: 'service-unavailable' } });
    await page.clock.setFixedTime(new Date('2026-09-19T12:00:00')); // four days later
    await page.reload();
    await expect(title(page)).toHaveText("Can't check your subscription");
    await expect(page.getByRole('button', { name: 'Start free trial' })).toHaveCount(0);

    // connectivity returns (quietly — no notification), and the person taps "Try again"
    await page.evaluate(() => {
      const state = JSON.parse(window.localStorage.getItem('freelanche-mock:billing')!) as Record<string, unknown>;
      window.localStorage.setItem('freelanche-mock:billing', JSON.stringify({ ...state, fail: {} }));
    });
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(nav(page)).toBeVisible();
  });

  test('works offline for a subscriber after the first visit', async ({ page, context }) => {
    await seed(page, { entries: ENTRIES, subscription: 'active' });
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('every language says it properly', () => {
  for (const code of ['en', 'ru', 'zh', 'es', 'hi', 'ar', 'pt', 'bn', 'ja', 'fr', 'de', 'ko', 'ur', 'id']) {
    test(`${code}: the paywall is translated, with the price and the way out`, async ({ page }) => {
      const d = dict(code);
      await seed(page, { entries: ENTRIES, subscription: 'none', language: code });
      await page.goto('/');
      await expect(title(page)).toHaveText(d['paywall.title.trial']!);
      await expect(page.getByRole('button', { name: d['paywall.cta.trial'] })).toBeVisible();
      await expect(page.getByRole('button', { name: d['paywall.restore'] })).toBeVisible();
      await expect(page.locator('.paywall__terms')).toContainText('2.99');
      await expect(page.locator('.paywall__terms')).not.toContainText('{price}');
    });
  }
});
