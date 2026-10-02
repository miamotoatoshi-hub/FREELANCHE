package app.freelanche.tracker;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Google Play Billing for the web app, kept deliberately thin: it reports what Google Play says and nothing
 * more. What those facts MEAN (who may use the app, what happens when a subscription is cancelled, expires or
 * fails to renew) is decided by the tested rules in src/billing/entitlement.ts, not here.
 *
 * Calls (see src/billing/playGateway.ts for the matching TypeScript):
 *   getSubscriptionOffer({ productId })        → { formattedPrice, trialPeriod, offerToken }
 *   queryPurchases()                            → { purchases: [...] }
 *   purchase({ productId, offerToken })         → { outcome: 'purchased' | 'pending' | 'cancelled' }
 *   acknowledge({ purchaseToken })
 *   openManageSubscriptions({ productId })
 * Event: "purchasesChanged" — Google Play reported a purchase change (e.g. a pending payment completed).
 *
 * Errors are rejected with the name of the Billing Library response code as the error code, e.g.
 * "SERVICE_UNAVAILABLE" or "ITEM_ALREADY_OWNED". Purchase tokens are never logged.
 *
 * NOTE: this file could not be compiled in the environment it was written in (no Android SDK / Google Maven
 * access). Build it once in Android Studio before relying on it — see docs/ANDROID_RELEASE.md.
 */
@CapacitorPlugin(name = "FreelancheBilling")
public class FreelancheBillingPlugin extends Plugin {

    /** The base plan created in Play Console for the monthly subscription. */
    private static final String BASE_PLAN_ID = "monthly";

    private static final String EVENT_PURCHASES_CHANGED = "purchasesChanged";

    private BillingClient client;

    // Everything below runs on the main thread (see onMain), so none of this state needs locking.
    private PluginCall pendingPurchase;
    private boolean connecting;
    private final List<Waiter> waiters = new ArrayList<>();

    private static final class Waiter {
        final PluginCall call;
        final Runnable onReady;

        Waiter(PluginCall call, Runnable onReady) {
            this.call = call;
            this.onReady = onReady;
        }
    }

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this::onPurchasesUpdated)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (client != null) {
            client.endConnection();
        }
    }

    /* ── plugin methods ───────────────────────────────────────────────────────────────────────── */

    @PluginMethod
    public void getSubscriptionOffer(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) {
            call.reject("productId is required", "DEVELOPER_ERROR");
            return;
        }
        onMain(() ->
            whenConnected(call, () ->
                queryDetails(productId, call, details -> {
                    ProductDetails.SubscriptionOfferDetails offer = chooseOffer(details);
                    if (offer == null) {
                        call.reject("No offer is available for this account", "NO_OFFER");
                        return;
                    }
                    JSObject result = new JSObject();
                    result.put("formattedPrice", recurringPrice(offer));
                    result.put("trialPeriod", trialPeriod(offer));
                    result.put("offerToken", offer.getOfferToken());
                    call.resolve(result);
                })
            )
        );
    }

    @PluginMethod
    public void queryPurchases(PluginCall call) {
        onMain(() ->
            whenConnected(call, () -> {
                QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build();
                client.queryPurchasesAsync(params, (result, purchases) -> {
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        reject(call, result);
                        return;
                    }
                    JSObject payload = new JSObject();
                    payload.put("purchases", toJson(purchases));
                    call.resolve(payload);
                });
            })
        );
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String offerToken = call.getString("offerToken");
        if (productId == null || offerToken == null) {
            call.reject("productId and offerToken are required", "DEVELOPER_ERROR");
            return;
        }
        onMain(() -> {
            if (pendingPurchase != null) {
                call.reject("A purchase is already in progress", "BUSY");
                return;
            }
            whenConnected(call, () ->
                queryDetails(productId, call, details -> {
                    BillingFlowParams.ProductDetailsParams product = BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        .setOfferToken(offerToken)
                        .build();
                    BillingFlowParams flow = BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(Collections.singletonList(product))
                        .build();
                    if (getActivity() == null) {
                        call.reject("The app is not in the foreground", "SERVICE_UNAVAILABLE");
                        return;
                    }
                    pendingPurchase = call;
                    BillingResult launched = client.launchBillingFlow(getActivity(), flow);
                    if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        pendingPurchase = null;
                        reject(call, launched);
                    }
                    // Otherwise Google's payment sheet is open; onPurchasesUpdated finishes the call.
                })
            );
        });
    }

    @PluginMethod
    public void acknowledge(PluginCall call) {
        String token = call.getString("purchaseToken");
        if (token == null) {
            call.reject("purchaseToken is required", "DEVELOPER_ERROR");
            return;
        }
        onMain(() ->
            whenConnected(call, () ->
                client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build(), result -> {
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        call.resolve();
                    } else {
                        reject(call, result);
                    }
                })
            )
        );
    }

    @PluginMethod
    public void openManageSubscriptions(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) {
            call.reject("productId is required", "DEVELOPER_ERROR");
            return;
        }
        Uri uri = Uri.parse(
            "https://play.google.com/store/account/subscriptions?sku=" + Uri.encode(productId) + "&package=" + Uri.encode(getContext().getPackageName())
        );
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Nothing on this device can open the subscription page", "BILLING_UNAVAILABLE");
        }
    }

    /* ── Google Play callbacks ────────────────────────────────────────────────────────────────── */

    /** Called by the Billing Library after the payment sheet closes, and when a pending payment changes state. */
    private void onPurchasesUpdated(@NonNull BillingResult result, @Nullable List<Purchase> purchases) {
        PluginCall call = pendingPurchase;
        pendingPurchase = null;
        int code = result.getResponseCode();

        if (call != null) {
            if (code == BillingClient.BillingResponseCode.OK) {
                boolean pending = false;
                if (purchases != null) {
                    for (Purchase purchase : purchases) {
                        if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                            pending = true;
                        }
                    }
                }
                JSObject outcome = new JSObject();
                outcome.put("outcome", pending ? "pending" : "purchased");
                call.resolve(outcome);
            } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
                JSObject outcome = new JSObject();
                outcome.put("outcome", "cancelled");
                call.resolve(outcome);
            } else {
                reject(call, result);
            }
        }
        // Either way, tell the web app to ask Google Play again: it is the one source of truth.
        notifyListeners(EVENT_PURCHASES_CHANGED, new JSObject());
    }

    /* ── helpers ──────────────────────────────────────────────────────────────────────────────── */

    private interface DetailsConsumer {
        void accept(ProductDetails details);
    }

    private void onMain(Runnable runnable) {
        getBridge().executeOnMainThread(runnable);
    }

    /** Runs {@code onReady} once connected to Google Play, connecting first if needed. Main thread only. */
    private void whenConnected(PluginCall call, Runnable onReady) {
        if (client.isReady()) {
            onReady.run();
            return;
        }
        waiters.add(new Waiter(call, onReady));
        if (connecting) {
            return;
        }
        connecting = true;
        client.startConnection(
            new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(@NonNull BillingResult result) {
                    connecting = false;
                    List<Waiter> toRun = new ArrayList<>(waiters);
                    waiters.clear();
                    for (Waiter waiter : toRun) {
                        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                            waiter.onReady.run();
                        } else {
                            reject(waiter.call, result);
                        }
                    }
                }

                @Override
                public void onBillingServiceDisconnected() {
                    if (!connecting) {
                        return; // dropped after a good connection; the next call reconnects
                    }
                    connecting = false;
                    List<Waiter> toFail = new ArrayList<>(waiters);
                    waiters.clear();
                    for (Waiter waiter : toFail) {
                        waiter.call.reject("Google Play disconnected", "SERVICE_DISCONNECTED");
                    }
                }
            }
        );
    }

    private void queryDetails(String productId, PluginCall call, DetailsConsumer consumer) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                Collections.singletonList(
                    QueryProductDetailsParams.Product.newBuilder().setProductId(productId).setProductType(BillingClient.ProductType.SUBS).build()
                )
            )
            .build();
        client.queryProductDetailsAsync(params, (result, queryResult) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                reject(call, result);
                return;
            }
            List<ProductDetails> list = queryResult.getProductDetailsList();
            if (list == null || list.isEmpty()) {
                call.reject("The subscription is not set up in Google Play", "ITEM_UNAVAILABLE");
                return;
            }
            consumer.accept(list.get(0));
        });
    }

    /**
     * Google Play lists only the offers this account is eligible for. Prefer the one with a free trial; otherwise the
     * plain base plan (the offer with no offer id). Never fall back to some other promotion we did not mean to show.
     */
    @Nullable
    private ProductDetails.SubscriptionOfferDetails chooseOffer(ProductDetails details) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) {
            return null;
        }
        ProductDetails.SubscriptionOfferDetails withTrial = null;
        ProductDetails.SubscriptionOfferDetails basePlan = null;
        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            if (!BASE_PLAN_ID.equals(offer.getBasePlanId())) {
                continue;
            }
            if (trialPeriod(offer) != null) {
                if (withTrial == null) {
                    withTrial = offer;
                }
            } else if (offer.getOfferId() == null && basePlan == null) {
                basePlan = offer;
            }
        }
        return withTrial != null ? withTrial : basePlan;
    }

    /** ISO 8601 length of the free phase (e.g. "P7D"), or null if the offer has no free trial. */
    @Nullable
    private String trialPeriod(ProductDetails.SubscriptionOfferDetails offer) {
        for (ProductDetails.PricingPhase phase : offer.getPricingPhases().getPricingPhaseList()) {
            if (phase.getPriceAmountMicros() == 0 && phase.getRecurrenceMode() == ProductDetails.RecurrenceMode.FINITE_RECURRING) {
                return phase.getBillingPeriod();
            }
        }
        return null;
    }

    /** The price that repeats every period, formatted by Google Play for this account's country. */
    private String recurringPrice(ProductDetails.SubscriptionOfferDetails offer) {
        List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
        for (ProductDetails.PricingPhase phase : phases) {
            if (phase.getRecurrenceMode() == ProductDetails.RecurrenceMode.INFINITE_RECURRING) {
                return phase.getFormattedPrice();
            }
        }
        return phases.get(phases.size() - 1).getFormattedPrice();
    }

    private JSArray toJson(@Nullable List<Purchase> purchases) {
        JSArray array = new JSArray();
        if (purchases == null) {
            return array;
        }
        for (Purchase purchase : purchases) {
            String state;
            switch (purchase.getPurchaseState()) {
                case Purchase.PurchaseState.PURCHASED:
                    state = "purchased";
                    break;
                case Purchase.PurchaseState.PENDING:
                    state = "pending";
                    break;
                default:
                    state = "unspecified";
            }
            for (String productId : purchase.getProducts()) {
                JSObject item = new JSObject();
                item.put("productId", productId);
                item.put("purchaseToken", purchase.getPurchaseToken());
                item.put("purchaseTime", purchase.getPurchaseTime());
                item.put("purchaseState", state);
                item.put("autoRenewing", purchase.isAutoRenewing());
                item.put("acknowledged", purchase.isAcknowledged());
                array.put(item);
            }
        }
        return array;
    }

    private void reject(PluginCall call, BillingResult result) {
        call.reject(result.getDebugMessage(), codeName(result.getResponseCode()));
    }

    private static String codeName(int code) {
        switch (code) {
            case BillingClient.BillingResponseCode.SERVICE_TIMEOUT:
                return "SERVICE_TIMEOUT";
            case BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED:
                return "FEATURE_NOT_SUPPORTED";
            case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED:
                return "SERVICE_DISCONNECTED";
            case BillingClient.BillingResponseCode.USER_CANCELED:
                return "USER_CANCELED";
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE:
                return "SERVICE_UNAVAILABLE";
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE:
                return "BILLING_UNAVAILABLE";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE:
                return "ITEM_UNAVAILABLE";
            case BillingClient.BillingResponseCode.DEVELOPER_ERROR:
                return "DEVELOPER_ERROR";
            case BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED:
                return "ITEM_ALREADY_OWNED";
            case BillingClient.BillingResponseCode.ITEM_NOT_OWNED:
                return "ITEM_NOT_OWNED";
            case BillingClient.BillingResponseCode.NETWORK_ERROR:
                return "NETWORK_ERROR";
            default:
                return "ERROR";
        }
    }
}
