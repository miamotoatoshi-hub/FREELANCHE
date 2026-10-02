import { Capacitor } from '@capacitor/core';
import { createMockGateway } from './mockGateway';
import { createPlayGateway } from './playGateway';
import { EntitlementStore, type MemoryStorage } from './store';
import type { BillingGateway } from './types';

export const ENTITLEMENT_KEY = 'freelanche:entitlement';

/** Nothing to buy from: a plain browser, or a device without Google Play. The app stays locked there. */
const noGateway: BillingGateway = {
  kind: 'none',
  getProduct: () => Promise.reject(new Error('Google Play Billing is not available here')),
  queryPurchases: () => Promise.resolve([]),
  purchase: () => Promise.reject(new Error('Google Play Billing is not available here')),
  acknowledge: () => Promise.resolve(),
  openManageSubscriptions: () => Promise.resolve(),
  onPurchasesChanged: () => () => undefined,
};

/**
 * Picks where subscription facts come from:
 *  - the Android app            → Google Play Billing
 *  - `npm run dev` / mock build → a pretend Google Play (compiled out of production builds)
 *  - anywhere else              → none, so the app stays locked rather than silently free
 */
export function createGateway(): BillingGateway {
  if (__BILLING_MODE__ === 'mock') return createMockGateway(window.localStorage);
  if (Capacitor.isNativePlatform()) return createPlayGateway();
  return noGateway;
}

function browserMemory(): MemoryStorage {
  return {
    read: () => window.localStorage.getItem(ENTITLEMENT_KEY),
    write: (text) => window.localStorage.setItem(ENTITLEMENT_KEY, text),
  };
}

export function createEntitlementStore(gateway: BillingGateway = createGateway()): EntitlementStore {
  return new EntitlementStore({ gateway, storage: browserMemory(), now: () => Date.now() });
}

export { EntitlementStore } from './store';
export type { EntitlementSnapshot } from './store';
