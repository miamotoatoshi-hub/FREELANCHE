/**
 * The vocabulary of subscriptions. Pure data — nothing in here knows about Google Play,
 * Capacitor or React, so the rules built on it can be tested exhaustively.
 */

/** The one auto-renewing subscription that unlocks the app. Created in Play Console (see docs/ANDROID_RELEASE.md). */
export const SUBSCRIPTION_PRODUCT_ID = 'freelanche_premium';

/** How long a successful check keeps the app unlocked when Google Play can't be reached (travel, flaky network). */
export const OFFLINE_GRACE_MS = 72 * 60 * 60 * 1000;

/** While the app stays open it quietly re-checks this often, so a cancellation or renewal is noticed. */
export const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** What Google Play reports about one purchase. `purchaseToken` is a secret: never log it, never show it. */
export interface PlayPurchase {
  productId: string;
  purchaseToken: string;
  purchaseTimeMs: number;
  /** `pending` = the payment has not completed yet (e.g. cash or slow bank); no access until it does. */
  state: 'purchased' | 'pending';
  /** False once the person cancels: access continues to the end of the paid period, then stops. */
  autoRenewing: boolean;
  /** Google refunds purchases that are not acknowledged within three days. */
  acknowledged: boolean;
}

/** Why talking to Google Play failed. Used for friendly messages and for the offline-grace decision. */
export type BillingErrorCode =
  /** Not running inside the Android app, or Play Store is missing / disabled / too old. */
  | 'billing-unavailable'
  /** Play Store was reachable but not answering (also: no network, timeouts). Worth retrying. */
  | 'service-unavailable'
  /** The subscription isn't set up in Play Console (or not published for this build). */
  | 'item-unavailable'
  /** Something in our own configuration is wrong. A bug, never the person's fault. */
  | 'developer-error'
  | 'unknown';

export class BillingError extends Error {
  readonly code: BillingErrorCode;
  constructor(code: BillingErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BillingError';
    this.code = code;
  }
}

/** What the paywall needs to describe the offer truthfully. Everything comes from Google Play. */
export interface ProductInfo {
  /** The recurring price exactly as Play formats it for this person's country, e.g. "€2.99". */
  formattedPrice: string;
  /** Length of the free trial this person is eligible for, or null (never offered, or already used). */
  trialDays: number | null;
  /** Opaque token of the offer to buy (Play picks which offers a person is eligible for). */
  offerToken: string;
}

export type PurchaseOutcome = 'purchased' | 'pending' | 'cancelled';

/**
 * Where subscription facts come from. The real implementation talks to Google Play through a native
 * plugin; tests and development use an in-memory one. Nothing else in the app touches Play.
 */
export interface BillingGateway {
  readonly kind: 'play' | 'mock' | 'none';
  /** Loads the offer (price, trial) to show on the paywall. Throws BillingError. */
  getProduct(): Promise<ProductInfo>;
  /** Every purchase of this Google account that Play considers current. Throws BillingError. */
  queryPurchases(): Promise<PlayPurchase[]>;
  /** Opens Google Play's payment sheet. Throws BillingError for real problems; cancelling is an outcome. */
  purchase(offerToken: string): Promise<PurchaseOutcome>;
  acknowledge(purchaseToken: string): Promise<void>;
  /** Opens Google Play's subscription management page for this subscription. */
  openManageSubscriptions(): Promise<void>;
  /** Called when Play reports a purchase change we didn't start (pending payment completed, bought elsewhere). */
  onPurchasesChanged(listener: () => void): () => void;
}

/** What the last conversation with Google Play told us. */
export type Verification =
  | { kind: 'ok'; purchases: readonly PlayPurchase[]; at: number }
  | { kind: 'failed'; error: BillingErrorCode; at: number }
  | { kind: 'unsupported'; at: number };

export type AccessStatus =
  /** First check still running and nothing recent is remembered. */
  | 'checking'
  /** Paid (or on the free trial) and set to renew. */
  | 'active'
  /** Paid, but cancelled: access continues until the end of the period already paid for. */
  | 'active-ending'
  /** A purchase was started but the payment hasn't completed. No access yet. */
  | 'pending'
  /** No current subscription: never started, expired, refunded, or payment failed and the grace period ran out. */
  | 'inactive'
  /** Google Play couldn't be reached and nothing recent is remembered — not the same as "not subscribed". */
  | 'unverified'
  /** This device can't use Google Play Billing at all (a web browser, a device without Play Store). */
  | 'unavailable';

export interface Access {
  status: AccessStatus;
  /** The one question the rest of the app asks: may this person use the app right now? */
  entitled: boolean;
  /** Entitled on the strength of a remembered check, because Google Play could not be reached. */
  stale: boolean;
  /** Not entitled, but was before (expired, refunded, payment failed) — changes the wording, not the rules. */
  lapsed: boolean;
}

/** The little we remember between launches. Contains no purchase token and nothing personal. */
export interface EntitlementCache {
  lastVerifiedAt: number;
  lastStatus: AccessStatus;
  everEntitled: boolean;
}
