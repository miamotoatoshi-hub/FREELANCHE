import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { parseTrialDays } from './entitlement';
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
 * Google Play Billing, through our own small native plugin (android/.../FreelancheBillingPlugin.java).
 * The plugin is deliberately thin — it exposes Play's facts and nothing else — and every rule about
 * what those facts *mean* lives in entitlement.ts, where it is tested.
 */

interface NativePurchase {
  productId: string;
  purchaseToken: string;
  purchaseTime: number;
  purchaseState: 'purchased' | 'pending' | 'unspecified';
  autoRenewing: boolean;
  acknowledged: boolean;
}

interface NativeOffer {
  formattedPrice: string;
  /** ISO 8601 period of the free trial phase this person is eligible for, e.g. "P7D"; null if none. */
  trialPeriod: string | null;
  offerToken: string;
}

export interface FreelancheBillingPlugin {
  getSubscriptionOffer(options: { productId: string }): Promise<NativeOffer>;
  queryPurchases(): Promise<{ purchases: NativePurchase[] }>;
  purchase(options: { productId: string; offerToken: string }): Promise<{ outcome: PurchaseOutcome }>;
  acknowledge(options: { purchaseToken: string }): Promise<void>;
  openManageSubscriptions(options: { productId: string }): Promise<void>;
  addListener(event: 'purchasesChanged', listener: () => void): Promise<PluginListenerHandle>;
}

/** Longest we wait for Google Play before treating it as unreachable (the purchase sheet itself is exempt). */
const TIMEOUT_MS = 12_000;

/** Native error codes → our small vocabulary. Codes mirror com.android.billingclient BillingResponseCode names. */
export function mapNativeError(error: unknown): BillingError {
  if (error instanceof BillingError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message : undefined;
  let mapped: BillingErrorCode;
  switch (code) {
    case 'BILLING_UNAVAILABLE':
    case 'FEATURE_NOT_SUPPORTED':
    case 'UNIMPLEMENTED':
      mapped = 'billing-unavailable';
      break;
    case 'SERVICE_UNAVAILABLE':
    case 'SERVICE_DISCONNECTED':
    case 'SERVICE_TIMEOUT':
    case 'NETWORK_ERROR':
    case 'ERROR':
      mapped = 'service-unavailable';
      break;
    case 'ITEM_UNAVAILABLE':
    case 'PRODUCT_NOT_FOUND':
    case 'NO_OFFER':
      mapped = 'item-unavailable';
      break;
    case 'DEVELOPER_ERROR':
      mapped = 'developer-error';
      break;
    default:
      mapped = 'unknown';
  }
  return new BillingError(mapped, message);
}

export function toPlayPurchases(native: readonly NativePurchase[]): PlayPurchase[] {
  const result: PlayPurchase[] = [];
  for (const item of native) {
    if (item.purchaseState !== 'purchased' && item.purchaseState !== 'pending') continue;
    result.push({
      productId: item.productId,
      purchaseToken: item.purchaseToken,
      purchaseTimeMs: item.purchaseTime,
      state: item.purchaseState,
      autoRenewing: item.autoRenewing,
      acknowledged: item.acknowledged,
    });
  }
  return result;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new BillingError('service-unavailable', 'timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(mapNativeError(error));
      },
    );
  });
}

export function createPlayGateway(plugin: FreelancheBillingPlugin = registerPlugin<FreelancheBillingPlugin>('FreelancheBilling')): BillingGateway {
  const productId = SUBSCRIPTION_PRODUCT_ID;
  return {
    kind: 'play',

    async getProduct(): Promise<ProductInfo> {
      const offer = await withTimeout(plugin.getSubscriptionOffer({ productId }), TIMEOUT_MS);
      return { formattedPrice: offer.formattedPrice, trialDays: parseTrialDays(offer.trialPeriod), offerToken: offer.offerToken };
    },

    async queryPurchases() {
      const { purchases } = await withTimeout(plugin.queryPurchases(), TIMEOUT_MS);
      return toPlayPurchases(purchases);
    },

    async purchase(offerToken) {
      try {
        // No timeout: the person is looking at Google's payment sheet for as long as they like.
        const { outcome } = await plugin.purchase({ productId, offerToken });
        return outcome;
      } catch (error) {
        // "Already owned" means they are subscribed; the follow-up check will unlock the app.
        if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ITEM_ALREADY_OWNED') return 'purchased';
        throw mapNativeError(error);
      }
    },

    async acknowledge(purchaseToken) {
      await withTimeout(plugin.acknowledge({ purchaseToken }), TIMEOUT_MS);
    },

    async openManageSubscriptions() {
      await withTimeout(plugin.openManageSubscriptions({ productId }), TIMEOUT_MS);
    },

    onPurchasesChanged(listener) {
      let handle: PluginListenerHandle | null = null;
      let removed = false;
      plugin
        .addListener('purchasesChanged', listener)
        .then((created) => {
          if (removed) void created.remove();
          else handle = created;
        })
        .catch(() => {
          /* without the listener the app still re-checks at launch, on resume and every few hours */
        });
      return () => {
        removed = true;
        void handle?.remove();
      };
    },
  };
}
