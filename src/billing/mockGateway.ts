import {
  BillingError,
  SUBSCRIPTION_PRODUCT_ID,
  type BillingErrorCode,
  type BillingGateway,
  type PlayPurchase,
  type ProductInfo,
  type PurchaseOutcome,
} from './types';

/**
 * A pretend Google Play for development, unit tests and the browser end-to-end tests.
 * It is compiled out of production builds (see createGateway), so no "free" switch can ship.
 *
 * Its whole state lives in one storage key, read fresh on every call, so a test can change what
 * "Google Play" says — cancel, expire, fail — between two moments simply by rewriting that key.
 */

export const MOCK_STORAGE_KEY = 'freelanche-mock:billing';
export const MOCK_CHANGED_EVENT = 'freelanche-mock:changed';

export interface MockBillingState {
  purchases: PlayPurchase[];
  formattedPrice: string;
  trialDays: number | null;
  /** The free trial can be used once per account: after a purchase it is no longer offered. */
  trialUsed: boolean;
  /** What the next payment sheet will end with. */
  purchaseResult: PurchaseOutcome;
  /** Make the next calls fail the way Google Play sometimes does. */
  fail: { query?: BillingErrorCode; product?: BillingErrorCode; purchase?: BillingErrorCode };
  /** How many times "Manage subscription" was opened (so tests can assert it). */
  manageOpened: number;
  /** Pretend latency in milliseconds. */
  delayMs: number;
}

export const DEFAULT_MOCK_STATE: MockBillingState = {
  purchases: [],
  formattedPrice: '€2.99',
  trialDays: 7,
  trialUsed: false,
  purchaseResult: 'purchased',
  fail: {},
  manageOpened: 0,
  delayMs: 0,
};

interface MockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createMockGateway(storage: MockStorage, now: () => number = Date.now): BillingGateway {
  const read = (): MockBillingState => {
    try {
      const text = storage.getItem(MOCK_STORAGE_KEY);
      return text ? { ...DEFAULT_MOCK_STATE, ...(JSON.parse(text) as Partial<MockBillingState>) } : { ...DEFAULT_MOCK_STATE };
    } catch {
      return { ...DEFAULT_MOCK_STATE };
    }
  };
  const write = (state: MockBillingState) => storage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state));
  const pause = (state: MockBillingState) => (state.delayMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, state.delayMs)) : Promise.resolve());

  return {
    kind: 'mock',

    async getProduct(): Promise<ProductInfo> {
      const state = read();
      await pause(state);
      if (state.fail.product) throw new BillingError(state.fail.product);
      return { formattedPrice: state.formattedPrice, trialDays: state.trialUsed ? null : state.trialDays, offerToken: 'mock-offer' };
    },

    async queryPurchases() {
      const state = read();
      await pause(state);
      if (state.fail.query) throw new BillingError(state.fail.query);
      return state.purchases;
    },

    async purchase() {
      const state = read();
      await pause(state);
      if (state.fail.purchase) throw new BillingError(state.fail.purchase);
      if (state.purchaseResult === 'cancelled') return 'cancelled';
      const purchase: PlayPurchase = {
        productId: SUBSCRIPTION_PRODUCT_ID,
        purchaseToken: `mock-token-${now()}`,
        purchaseTimeMs: now(),
        state: state.purchaseResult === 'pending' ? 'pending' : 'purchased',
        autoRenewing: true,
        acknowledged: false,
      };
      write({ ...state, purchases: [...state.purchases, purchase], trialUsed: true });
      return state.purchaseResult;
    },

    async acknowledge(purchaseToken) {
      const state = read();
      write({ ...state, purchases: state.purchases.map((p) => (p.purchaseToken === purchaseToken ? { ...p, acknowledged: true } : p)) });
    },

    async openManageSubscriptions() {
      const state = read();
      write({ ...state, manageOpened: state.manageOpened + 1 });
    },

    onPurchasesChanged(listener) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === MOCK_STORAGE_KEY) listener();
      };
      window.addEventListener('storage', onStorage);
      window.addEventListener(MOCK_CHANGED_EVENT, listener);
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(MOCK_CHANGED_EVENT, listener);
      };
    },
  };
}
