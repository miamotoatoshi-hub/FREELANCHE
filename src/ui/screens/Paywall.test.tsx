import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { serializeCache } from '../../billing/entitlement';
import { createLocalPersistence, createMemoryStorage, STORAGE_KEY, type KeyValueStorage } from '../../data/persistence';
import { AppStore } from '../../state/store';
import { activePurchase, createFakePlay, NOW, renderApp, type FakePlay } from '../../test/renderApp';

let storage: KeyValueStorage;
let play: FakePlay;

/** A person who finished onboarding before: their data is saved, and Google Play decides about access. */
function returningUser() {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      settings: { name: 'Alex', currency: 'EUR', defaultMonthlyGoal: 300000, theme: 'light', onboardingCompleted: true, language: 'en' },
      entries: [{ id: 'e1', amount: 125000, currency: 'EUR', date: '2026-09-02', note: 'Logo', createdAt: '2026-09-02T09:00:00.000Z', updatedAt: '2026-09-02T09:00:00.000Z' }],
      goals: [],
    }),
  );
  return new AppStore(createLocalPersistence(storage), {
    now: () => new Date('2026-09-15T12:00:00'),
    newId: () => `id-${Math.random().toString(36).slice(2)}`,
    defaults: { language: 'en', currency: 'EUR' },
  });
}

const visible = (text: string) => text.replace(/[⁦-⁩]/g, '');

beforeEach(() => {
  storage = createMemoryStorage();
  play = createFakePlay();
});

describe('there is no free tier', () => {
  it('a returning user without a subscription sees only the paywall — never the app', async () => {
    await renderApp(returningUser(), play);
    expect(screen.getByRole('heading', { level: 1, name: 'Start your free trial' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add income' })).not.toBeInTheDocument();
    expect(await screen.findByText('7 days free')).toBeInTheDocument();
    expect(screen.getByText('then €2.99 per month')).toBeInTheDocument();
  });

  it('their data is untouched and still theirs: export, language, privacy and delete stay available', async () => {
    await renderApp(returningUser(), play);
    expect(screen.getByText('Your data is safe')).toBeInTheDocument();
    for (const name of ['Export data', 'English', 'Privacy', 'Delete all data']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).entries).toHaveLength(1);
  });

  it('states the terms before asking for money: price, renewal, and how to cancel', async () => {
    await renderApp(returningUser(), play);
    expect(await screen.findByText(/€2\.99 per month is charged to your Google Play account and renews automatically/)).toBeInTheDocument();
    expect(screen.getByText(/cancel before the trial ends and you won't be charged/)).toBeInTheDocument();
  });

  it('shows the price Google Play reports, not one baked into the app', async () => {
    play.set({ formattedPrice: '2,99 €' });
    await renderApp(returningUser(), play);
    expect(await screen.findByText('then 2,99 € per month')).toBeInTheDocument();
  });

  it('does not promise a trial that this Google account has already used', async () => {
    play.set({ trialUsed: true });
    await renderApp(returningUser(), play);
    expect(await screen.findByRole('heading', { level: 1, name: 'Subscribe to Freelanche' })).toBeInTheDocument();
    expect(screen.getByText('€2.99 per month')).toBeInTheDocument();
    expect(screen.queryByText(/days? free/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeInTheDocument();
  });
});

describe('subscribers', () => {
  it('open straight into the app', async () => {
    play.set({ purchases: [activePurchase()] });
    await renderApp(returningUser(), play);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.queryByText('Start your free trial')).not.toBeInTheDocument();
  });

  it('starting the free trial unlocks the app at once', async () => {
    const user = userEvent.setup();
    await renderApp(returningUser(), play);
    await user.click(await screen.findByRole('button', { name: 'Start free trial' }));
    expect(await screen.findByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(play.state().purchases).toHaveLength(1);
    expect(play.state().purchases[0]!.acknowledged).toBe(true);
  });

  it('closing the payment sheet leaves the paywall as it was', async () => {
    const user = userEvent.setup();
    play.set({ purchaseResult: 'cancelled' });
    await renderApp(returningUser(), play);
    await user.click(await screen.findByRole('button', { name: 'Start free trial' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Start your free trial' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a Google Play failure during purchase is explained, and nothing is unlocked', async () => {
    const user = userEvent.setup();
    play.set({ fail: { purchase: 'service-unavailable' } });
    await renderApp(returningUser(), play);
    await user.click(await screen.findByRole('button', { name: 'Start free trial' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Google Play");
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });

  it('a payment that is still pending gives no access and says so', async () => {
    const user = userEvent.setup();
    play.set({ purchaseResult: 'pending' });
    await renderApp(returningUser(), play);
    await user.click(await screen.findByRole('button', { name: 'Start free trial' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Waiting for your payment' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });
});

describe('restoring purchases', () => {
  it('unlocks the app when this Google account already has a subscription', async () => {
    const user = userEvent.setup();
    const { entitlements } = await renderApp(returningUser(), play);
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    play.set({ purchases: [activePurchase()] }); // e.g. bought on another phone
    await user.click(screen.getByRole('button', { name: 'Restore purchases' }));
    expect(await screen.findByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(entitlements.getSnapshot().access.status).toBe('active');
  });

  it('says plainly when there is nothing to restore', async () => {
    const user = userEvent.setup();
    await renderApp(returningUser(), play);
    await user.click(screen.getByRole('button', { name: 'Restore purchases' }));
    expect(await screen.findByText('No active subscription was found for this Google account.')).toBeInTheDocument();
  });
});

describe('subscriptions ending', () => {
  it('a cancelled subscription keeps working until the paid period ends, and Settings says so', async () => {
    const user = userEvent.setup();
    play.set({ purchases: [activePurchase({ autoRenewing: false })] });
    await renderApp(returningUser(), play);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Settings' }));
    expect(await screen.findByText('Cancelled — active until the end of the paid period')).toBeInTheDocument();
  });

  it('when Google stops listing the subscription the app locks, and the wording says it has ended', async () => {
    play.set({ purchases: [activePurchase()] });
    const { entitlements } = await renderApp(returningUser(), play);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();

    play.set({ purchases: [] }); // expired, refunded, or the payment failed past the grace period
    await act(async () => {
      await entitlements.refresh();
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Your subscription has ended' })).toBeInTheDocument();
    expect(screen.getByText(/Your income data is safe on this device/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).entries).toHaveLength(1);
  });

  it('a renewed or resubscribed account unlocks again without restarting', async () => {
    play.set({ purchases: [] });
    const { entitlements } = await renderApp(returningUser(), play);
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    play.set({ purchases: [activePurchase()] });
    await act(async () => {
      await entitlements.refresh();
    });
    expect(await screen.findByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });
});

describe('when Google Play cannot be reached', () => {
  it('a subscriber who checked recently is not locked out', async () => {
    play.set({ fail: { query: 'service-unavailable' } });
    const memory = serializeCache({ lastVerifiedAt: NOW - 24 * 3_600_000, lastStatus: 'active', everEntitled: true });
    await renderApp(returningUser(), play, memory);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Settings' }));
    expect(await screen.findByText("Couldn't reach Google Play — showing your last check")).toBeInTheDocument();
  });

  it('with no recent check it asks to reconnect — it does not say the subscription ended', async () => {
    play.set({ fail: { query: 'service-unavailable' } });
    await renderApp(returningUser(), play);
    expect(screen.getByRole('heading', { level: 1, name: "Can't check your subscription" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start free trial' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    play.set({ fail: {}, purchases: [activePurchase()] });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument());
  });

  it('a device without Google Play Billing stays locked and explains why', async () => {
    await renderApp(
      returningUser(),
      {
        kind: 'none',
        getProduct: () => Promise.reject(new Error('n/a')),
        queryPurchases: () => Promise.resolve([]),
        purchase: () => Promise.reject(new Error('n/a')),
        acknowledge: () => Promise.resolve(),
        openManageSubscriptions: () => Promise.resolve(),
        onPurchasesChanged: () => () => undefined,
      },
      serializeCache({ lastVerifiedAt: NOW, lastStatus: 'active', everEntitled: true }),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Open Freelanche from Google Play' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start free trial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });
});

describe('managing the subscription', () => {
  it('Settings opens the Google Play subscription page and can restore', async () => {
    const user = userEvent.setup();
    play.set({ purchases: [activePurchase()] });
    await renderApp(returningUser(), play);
    await user.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: /Manage subscription/ }));
    expect(play.state().manageOpened).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Restore purchases' }));
    expect(await screen.findByText('Subscription restored. Welcome back!')).toBeInTheDocument();
  });
});

describe('deleting everything from the locked screen', () => {
  it('erases the data and starts over with the language question', async () => {
    const user = userEvent.setup();
    await renderApp(returningUser(), play);
    await user.click(screen.getByRole('button', { name: 'Delete all data' }));
    await user.click(screen.getByRole('button', { name: 'Delete all' }));
    expect(await screen.findByRole('heading', { name: 'What language would you like to use in the app?' })).toBeInTheDocument();
    expect(visible(storage.getItem(STORAGE_KEY) ?? '')).not.toContain('Logo');
  });
});
