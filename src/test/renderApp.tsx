import { render } from '@testing-library/react';
import { App } from '../App';
import { EntitlementProvider } from '../billing/context';
import { createMockGateway, DEFAULT_MOCK_STATE, MOCK_STORAGE_KEY, type MockBillingState } from '../billing/mockGateway';
import { EntitlementStore } from '../billing/store';
import { SUBSCRIPTION_PRODUCT_ID, type BillingGateway, type PlayPurchase } from '../billing/types';
import { I18nProvider } from '../i18n/I18nProvider';
import { loadLocale } from '../i18n/registry';
import { StoreProvider } from '../state/context';
import type { AppStore } from '../state/store';

export const NOW = Date.parse('2026-09-15T12:00:00');

export const activePurchase = (overrides: Partial<PlayPurchase> = {}): PlayPurchase => ({
  productId: SUBSCRIPTION_PRODUCT_ID,
  purchaseToken: 'test-token',
  purchaseTimeMs: NOW - 3_600_000,
  state: 'purchased',
  autoRenewing: true,
  acknowledged: true,
  ...overrides,
});

/** A pretend Google Play whose answers a test can change at any moment. */
export function createFakePlay(initial: Partial<MockBillingState> = {}) {
  const map = new Map<string, string>([[MOCK_STORAGE_KEY, JSON.stringify({ ...DEFAULT_MOCK_STATE, ...initial })]]);
  const read = (): MockBillingState => JSON.parse(map.get(MOCK_STORAGE_KEY)!) as MockBillingState;
  const gateway = createMockGateway({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }, () => NOW);
  return {
    gateway,
    state: read,
    set: (patch: Partial<MockBillingState>) => map.set(MOCK_STORAGE_KEY, JSON.stringify({ ...read(), ...patch })),
  };
}

export type FakePlay = ReturnType<typeof createFakePlay>;

/** The whole app, wired to a pretend Google Play. Resolves once the first subscription check is done. */
export async function renderApp(store: AppStore, play: FakePlay | BillingGateway = createFakePlay(), memory: string | null = null) {
  const gateway = 'gateway' in play ? play.gateway : play;
  const entitlements = new EntitlementStore({
    gateway,
    storage: { read: () => memory, write: (text) => void (memory = text) },
    now: () => NOW,
    minRecheckMs: 0,
  });
  await loadLocale(store.getSnapshot().data.settings.language);
  await entitlements.start();
  const view = render(
    <StoreProvider store={store}>
      <EntitlementProvider store={entitlements}>
        <I18nProvider>
          <App />
        </I18nProvider>
      </EntitlementProvider>
    </StoreProvider>,
  );
  return { ...view, entitlements, unmount: () => { entitlements.stop(); view.unmount(); } };
}
