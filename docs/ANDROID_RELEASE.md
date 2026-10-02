# Releasing Freelanche on Google Play — technical reference

> **New to Google Play Console?** Use the step-by-step [`PLAY_CONSOLE_CHECKLIST.md`](PLAY_CONSOLE_CHECKLIST.md) instead. This file is the
> developer reference behind it. See also [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) (what can and cannot be bypassed) and
> [`TESTING.md`](TESTING.md) (which tests are simulated and which prove real payments).

This is the checklist for everything that has to happen **outside the code**. Nothing here publishes anything by itself:
the app only reaches users when *you* promote a release to production in Play Console.

> **Status of the Android build.** The web app, the subscription rules and the paywall are fully tested with a *simulated* Google Play.
> The purchase-signature check and the Keystore stamp are compiled and unit-tested against the real Android classes. The rest of the
> native plugin and the Gradle files were type-checked but **never built by a real Android toolchain on the author's machine** (the
> authoring sandbox cannot reach Google's SDK servers). The CI job `android` (`.github/workflows/ci.yml`) is the first real build — read
> its result. And **no real Google Play purchase has been made**: the manual test in `TESTING.md` is the only thing that proves payments work.

---

## 1. Decisions to make *before* the first upload

| Decision | Default in the repo | Why it matters |
| --- | --- | --- |
| **Package name** | `app.freelanche.tracker` | **Permanent.** Google Play never lets you change it after the first upload. To change it, edit `appId` in `capacitor.config.ts`, `namespace` and `applicationId` in `android/app/build.gradle`, move `android/app/src/main/java/app/freelanche/tracker/`, update the `package` lines in the two Java files, the two names in `res/values/strings.xml`, and the class name in `app/proguard-rules.pro`. Then `npm run android:sync`. |
| **App name** | Freelanche | Shown on the store and under the icon (`res/values/strings.xml`). |
| **Developer name / contact email** | – | Needed for the privacy policy (`docs/PRIVACY_POLICY.md` has `[placeholders]`) and the store listing. |

## 2. One-time Play Console setup

You need a Google Play developer account (one-time fee, identity verification). Everything below is in
[Play Console](https://play.google.com/console). The wording of Google's forms changes; follow what the form asks and use
the answers in `docs/PLAY_DATA_SAFETY.md` and `docs/STORE_LISTING.md` as the source of truth for this app.

1. **Create app** → name, default language, *App*, *Paid* (subscriptions are sold inside the app), accept the declarations.
2. **Set up your app** (Dashboard tasks): privacy policy URL (host `docs/PRIVACY_POLICY.md` somewhere public, e.g. GitHub Pages),
   *App access* (all functionality is available once subscribed; for reviewers see step 6), *Ads* (**No ads**), *Content rating*
   questionnaire, *Target audience* (18+; not designed for children), *Data safety* (`docs/PLAY_DATA_SAFETY.md`),
   *Financial features* declaration (the app only records the user's own income; it offers no loans, payments, banking or
   investment services), *Government apps* (No).
3. **Store listing** → texts from `docs/STORE_LISTING.md`, the 512×512 icon (`public/icons/icon-512.png`), a 1024×500 feature
   graphic (you create this), and at least two phone screenshots (`SHOTS_DIR=./shots npx playwright test e2e/visual.spec.ts`
   produces screenshots in 14 languages from the test build; use the English, Arabic and German sets).
4. **Play App Signing**: accept it when you create the first release. Google keeps the real app-signing key; you only
   hold an *upload key* (step 4).

## 3. Build it once and look at it (do not skip)

Requirements: Android Studio (current stable; it includes JDK 21), Node 22. No Android Studio? Use the GitHub workflow *Android bundle (manual)* described in the checklist.

```bash
npm ci
npm run android:sync          # builds the web app, checks no test billing is inside it, copies it into the Android project
npx cap open android          # opens the project in Android Studio; let Gradle sync
```

If Gradle sync or the build reports an error in `FreelancheBillingPlugin.java`, it is almost certainly a one-line signature
difference in the Play Billing Library version — check <https://developer.android.com/google/play/billing/release-notes>
and fix it there. `android/variables.gradle` pins `billingVersion`; use the newest release.

Run it on a real phone (not an emulator without Play Store) signed in to a **licence-tester** Google account (step 5).
Expected: language → name → *Start your free trial* → Google's payment sheet → currency → goal → the app.

`npm run verify:release` is what protects you from shipping the pretend Google Play that development and the browser tests
use. It fails if anything from it is in the release bundle. `npm run android:sync` runs it first.

## 4. Signing (never share these files or passwords with anyone — including me)

Create an **upload key** once, on your own machine:

```bash
keytool -genkeypair -v -keystore ~/freelanche-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
```

Keep the `.jks` file and its passwords in a password manager and a backup. Then create `android/keystore.properties`
(this file is in `.gitignore`; never commit it):

```properties
storeFile=/home/you/freelanche-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
playLicenseKey=MIIBIjANBgkq…   # PUBLIC: Play Console → Monetize with Play → Monetization setup → Licensing
```

`npm run android:key` (script `scripts/create-upload-key.sh`) creates the key and this file for you, with the passwords typed
privately and never printed. **A release build refuses to run without a valid `playLicenseKey`** (or `FREELANCHE_PLAY_LICENSE_KEY`): it is the
public key the app uses to confirm that purchases were really signed by Google (`PurchaseSecurity.java`).

(or set the environment variables `FREELANCHE_UPLOAD_STORE_FILE`, `…_STORE_PASSWORD`, `…_KEY_ALIAS`, `…_KEY_PASSWORD`).
Then build the bundle:

```bash
npm run android:bundle        # → android/app/build/outputs/bundle/release/app-release.aab
```

Upload that `.aab` in Play Console. Each upload needs a higher version code: the build derives it from `package.json`
(`1.2.0` → `10200`), so bump the version there, or set `FREELANCHE_VERSION_CODE`.
Also upload `android/app/build/outputs/mapping/release/mapping.txt` with each release (readable crash reports).

## 5. Create the subscription (this must match the app exactly)

Play Console → *Monetize with Play* → *Products* → *Subscriptions* → **Create subscription**.

| Field | Value |
| --- | --- |
| Product ID | `freelanche_premium` (the app looks for exactly this: `src/billing/types.ts`) |
| Name | Freelanche |
| **Base plan** → ID | `monthly` (the app looks for exactly this: `FreelancheBillingPlugin.java`) |
| Type / period | Auto-renewing, **every 1 month** |
| Price | **€2.99** in EUR; review the automatic prices for other countries (the app shows whatever Google reports for each country — it never hard-codes a price) |
| Grace period | **7 days** (a failed renewal keeps working while Google retries the card) |
| Account hold | **30 days** (after the grace period, Google keeps retrying but access is switched off) |
| Resubscribe | **Allowed** |
| **Offer** on that base plan | Offer ID `trial-7d`, eligibility *New customer acquisition* (never had this subscription), one phase: **Free trial, 7 days** |

Activate the base plan **and** the offer. Until both are active the paywall shows "This subscription isn't available right now".

How the app maps Google's states (all of it is unit-tested in `src/billing/`):

| What happens in Google Play | What the app does |
| --- | --- |
| Free trial running | Subscription is listed → app unlocked |
| Trial ends, first payment succeeds | Same subscription still listed → app stays unlocked |
| Auto-renewal succeeds | Still listed → unlocked |
| User cancels | Listed with auto-renew off → unlocked until the paid period ends; Settings says so |
| Period ends after cancelling | Not listed → locked, "Your subscription has ended"; data untouched |
| Renewal payment fails, grace period | Still listed → unlocked |
| Grace period over (account hold) | Not listed → locked until the payment is fixed |
| Refund / revoked | Not listed → locked at the next check |
| Pending payment (cash, slow bank) | "Waiting for your payment"; unlocked once Google confirms it |
| New phone / reinstall | *Restore purchases* (or automatic at launch) reads the Google account's subscription |
| Google Play unreachable | A check from the last 72 hours is honoured; after that the app asks to reconnect |

The app re-checks at launch, when it comes back to the foreground, when Google reports a change, and every 6 hours.
It acknowledges new purchases immediately (Google refunds unacknowledged ones after 3 days).

## 6. Test before anything goes public

1. Play Console → *Settings* → *License testing*: add the Gmail addresses of your testers. Licence testers are never charged,
   and test subscriptions renew on an accelerated clock (a month ≈ 5 minutes, a free trial ≈ 3 minutes, a few minutes of grace period; a test
   subscription stops renewing after six renewals), so you can watch the whole lifecycle in one sitting.
2. *Testing* → *Internal testing* → create a release with your `.aab`, add the testers' email list, open the opt-in link on the phone.
3. On the phone check, in this order: first run (trial starts, payment sheet appears, no charge for testers) · restart (still
   unlocked) · airplane mode (still unlocked) · Play Store → Subscriptions → cancel (Settings shows "Cancelled — active until…",
   then locks when the test period ends) · reinstall + *Restore purchases* · a second Google account (must see the paywall) ·
   Arabic (right-to-left) · the smallest phone you own.
4. Give Google's reviewers a way in: *App access* → "All functionality requires a subscription. Reviewers can use the licence-tester
   account…" (add the tester credentials **only in that Play Console form**).

## 7. Going public — only when you decide to

New personal developer accounts must run a **closed test** with a minimum number of testers for a minimum number of days before
production access is granted (the requirement has been 12 testers for 14 days; check Play Console for the current rule).
Promote to *Production* yourself, with a staged rollout (e.g. 10 %) so you can halt it.
**Nothing in this repository publishes to production.** CI only runs tests.

## 8. Known limits and optional hardening

* **Entitlement is checked on the device** (the Play Billing Library on the phone, with Google's signature on each purchase verified and the offline memory
  stamped by the Android Keystore — see `SECURITY_REVIEW.md`). On a rooted or modified phone the local check can still be bypassed. The standard remedy is a small server that
  verifies purchase tokens with the Google Play Developer API and receives *Real-time developer notifications*. That needs your own
  Google Cloud project and a service account — create it yourself and never paste its key anywhere public or into chat. The app is
  structured for it: only `src/billing/store.ts` would call the verifier; the UI would not change. It would also add network
  access and change the privacy policy / Data safety form.
* **`android.permission.INTERNET`** is still in the manifest (template default). The app makes no network requests of its own (the page's
  Content-Security-Policy is `connect-src 'self'`, cleartext is off, and a test fails if any external request is attempted). To remove the
  permission entirely, delete the line in `AndroidManifest.xml` and test on a device; if the app still loads, ship without it.
* **If "Start free trial" does nothing on a phone** with a very old Android System WebView: Capacitor injects its bridge as an inline script on such
  WebViews, which the page's `script-src 'self'` policy blocks. Updating WebView fixes it; current devices are not affected.
* **Android Auto Backup** is on (default): income data may be copied to the user's own Google Drive backup and restored on a new phone.
  The subscription is never trusted from a backup — Google Play is asked again at launch.
* **Devices without Google Play** (e.g. some Huawei phones) cannot subscribe and will see "Can't check your subscription".
* Translations were written without a professional translator; have native speakers review the paywall and the legal wording first.
* A dependency note: `npm audit` reports a moderate advisory in `uuid`, pulled in by the Capacitor **CLI**'s iOS tooling. It is a
  development tool only and is not part of the app that ships.
