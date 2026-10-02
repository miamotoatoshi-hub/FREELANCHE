# Subscription security review

**Question:** can someone use Freelanche without paying? **Short answer:** an ordinary person cannot; a determined person with a
rooted phone or a modified copy of the app can, and no app that keeps all its data on the phone can fully prevent that.
This document lists every way I found, what is done about it, and what would still need a server.

## How access is decided

1. The Android app asks **Google Play on the phone** (Play Billing Library) which subscriptions this Google account has.
2. Each purchase comes with Google's **digital signature**; the app checks it against the app's Play licence key and ignores
   purchases that do not verify (`PurchaseSecurity.java`, tested).
3. Pure rules turn that list into "may use the app" (`src/billing/entitlement.ts`, tested). *Listed and auto-renewing* or
   *listed and cancelled-but-paid-up* → open; anything else → locked.
4. If Google Play cannot be reached, a check from the last **72 hours** is honoured. That memory is **stamped with a key from
   the Android Keystore** (`EntitlementSeal.java`), so it cannot be edited, copied or restored from a backup, and it is refused if
   the device clock has been turned back behind a time the app has already seen.
5. Everything else — the web version, a browser, a device without Google Play — stays **locked**. There is no "free" fallback.

## Every bypass I could think of

| # | Attempt | Who could do it | Result |
| --- | --- | --- | --- |
| 1 | Open the web app / PWA instead of the Android app | anyone | **Blocked.** The web build has no billing gateway and stays locked. |
| 2 | Find a "test billing" switch that ships in the release | anyone with the app | **Blocked.** The pretend Google Play used for development and browser tests is compiled out; `npm run verify:release` fails CI if any trace of it is in a release bundle (and was shown to fail on the test build). |
| 3 | Edit the stored data or the remembered check ("active") | someone with file access (root, or `adb backup`/`restore` on old phones) | **Blocked.** The remembered check carries a Keystore stamp; an edited, copied or restored one does not verify and is ignored. Income data itself is not what grants access. |
| 4 | Fake Play Store / fake billing service returning invented purchases (Lucky-Patcher-style) | rooted phone or emulator tools | **Blocked** *if the licence key is built in* — the invented purchase has no valid Google signature and is dropped. Release builds **refuse to build** without a valid licence key. |
| 5 | Turn the clock back while offline to stretch the 72-hour grace period | **anyone**, no root needed | **Mostly blocked.** The app remembers the latest time it has seen (inside the stamped memory); a clock more than 1 hour behind that voids the memory, and every launch moves the reference forward. What remains: if the app was *not opened* between the last check and the rollback, one jump back to within 72 hours of that check still works, and staying inside it means re-setting the clock again about every hour. Closing that fully needs a server (or the boot-relative clock plus more native code); I judged it not worth the complexity for now. |
| 6 | Cancel / get a refund, then stay offline | anyone | **Limited to 72 hours** per check, and only until the phone next reaches Google Play, which then returns "no subscription". |
| 7 | Take the free trial again | anyone with another Google account | **Not preventable by the app.** Google allows one trial per Google account (offer eligibility "never had this subscription"). New accounts get new trials. |
| 8 | Share one subscription between people | family / friends | **Not preventable.** A subscription belongs to a Google account. |
| 9 | Replay an old, genuinely signed "active" purchase after the subscription ended | rooted phone + a recording of Google's earlier answer | **Not blocked by the app.** A signature proves Google *once* said yes, not that it still does. Only asking Google's servers live (server-side verification) detects this. |
| 10 | Modify the app itself (decompile, remove the lock, re-sign, sideload) or hook it at run time | skilled attacker | **Not blocked.** Any lock that runs only on the phone can be removed from a modified copy. R8 shrinking/obfuscation makes it harder, not impossible. Because the app has *no server-side feature to withhold*, a server would not stop this either; only Google's Play Integrity API (see below) makes a tampered copy detectable. |
| 11 | Debug the release app / read its storage | anyone | **Blocked.** WebView debugging is off, the build is not debuggable, app storage is private, cleartext traffic is off. |

**Bottom line:** items 1–4 and 11 are closed and 5 is made impractical. Items 7–8 are inherent to Google Play subscriptions. Items 9–10 can only be reduced
with a backend and Play Integrity, and only matter against a motivated attacker with a rooted or modified phone.

## Is server-side purchase verification implemented? No — and here is exactly what it would need

Server-side verification means: your own small server asks **Google's Play Developer API** "is this purchase token still a
live subscription?" and the app trusts that answer. This project has no server, no hosting and no Google Cloud project, so I did **not**
build it, and I will not pretend otherwise. It closes item 6 and 9 (revocations and refunds are seen immediately, replays are
impossible) and gives exact expiry dates. To add it you would need:

1. **A Google Cloud project** linked to Play Console (*Play Console → Settings → API access*), with the **Google Play Android Developer API** enabled.
2. **A service account** with permission to view financial data / manage orders for this app. Create it yourself in Google Cloud.
   **Never put its key file in the app, in this repository, or in a chat.** The safest setup needs no key file at all: run the server
   on Google Cloud Run with that service account attached, and it authenticates through Google's metadata server.
3. **A small HTTPS server** (e.g. Cloud Run) with one endpoint that receives `{ purchaseToken }`, calls
   `purchases.subscriptionsv2.get`, and returns `{ entitled, expiryTime, autoRenewing }`. It must not log tokens.
4. Optionally **Real-time developer notifications** (a Pub/Sub topic) so the server learns about cancellations, renewals, holds and
   refunds the moment they happen.
5. **App changes** (small, all in `src/billing/store.ts`): call the endpoint after each Play check; add the server's address to the
   page's `connect-src`; update `docs/PRIVACY_POLICY.md` and the Play *Data safety* form (the app would then send a purchase token off the
   device); add a user-visible "couldn't verify" path.
6. **Play Integrity API** (also needs the Google Cloud project, and the server to decode the verdict) to refuse tampered or emulated
   copies of the app — the only defence against item 10.

If you want this, tell me and I'll build the app side and a reference server; you would create the Google Cloud pieces yourself.
It is a reasonable "version 2" once there are paying customers; it is not required to launch.

## Secrets: what is and is not in the repository

* **Committed, and fine to be public:** the Play licence key placeholder (empty), product ID `freelanche_premium`, base plan ID `monthly`.
* **Never committed (git-ignored):** `android/keystore.properties`, `*.jks`, `*.keystore`, `*.p12`, `*.pem`, `android/local.properties`.
* **Never needed by the app:** service-account keys, API keys, Stripe, card or bank details. Payments are Google Play's.
* A scan of the repository for private keys, tokens and service-account JSON is part of the final checks (see `docs/TESTING.md`).
