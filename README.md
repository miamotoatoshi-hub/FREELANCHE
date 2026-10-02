# Freelanche

A calm, offline-first income tracker for freelancers. Think of a water-tracking app — but for the money you earn.

**Open the app → see your progress → add income → done.**

No account of its own. No ads. No analytics. Your data never leaves the device. Sold as a Google Play subscription with a 7-day free trial — there is no free tier.

## What it does

- **Home** — earned this month inside a goal ring, what's left, what to earn per day to reach the goal, today vs yesterday, daily average, best day, and a cumulative income chart with the goal as a reference line.
- **Add income** — one bottom sheet: amount, optional note, date (defaults to today), quick-add buttons. Three taps for the usual case.
- **History** — entries grouped by day, edit / delete (with confirmation), and a simple calendar to look at a single day.
- **Insights** — best day, average per working day, days with income, income streak, and a neutral comparison with last month. Nothing is shown that the data can't support.
- **First launch** — five short steps, always in this order: **language → name → free trial → currency → monthly goal**. The third step *is* the account: the Google account that Google Play already uses holds the subscription (no password to invent) and restores it on any phone. The goal field shows the currency you just picked (€2,000 · $2,000 · ₽200,000); nothing is assumed, and the goal can be skipped.
- **Subscription** — the whole app needs an active subscription or its free trial. Without one only the paywall opens; even then people can still export their data, change the language, read the privacy notice or erase everything. Settings shows the status, opens Google Play's subscription page and restores purchases.
- **Settings** — name, language, currency, monthly goal, light / dark / system theme, CSV export & import, delete everything.
- **14 languages** — English, 中文 (简体), हिन्दी, Español, Français, Deutsch, العربية, বাংলা, Português, Русский, اردو, Bahasa Indonesia, 日本語, 한국어 — with right-to-left layouts for Arabic and Urdu. See [Languages](#languages-and-localisation).
- Month navigation across every screen, a different goal per month, decimal amounts, ~110 currencies searchable by name, code or symbol.

## Run it

```bash
npm install
npm run dev          # development server (uses the pretend Google Play, so you can try the paywall)
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build at http://127.0.0.1:4173
```

It's a PWA: open it on a phone, "Add to Home Screen", and it behaves like a native app — including with no connectivity at all (a small service worker precaches the whole build).

### Tests

```bash
npm test             # 450+ unit tests (Vitest): calculations, dates, money, CSV, goals, store, persistence, i18n, onboarding, subscription rules, paywall
npm run lint         # ESLint incl. React hooks rules
npm run test:e2e     # ~230 real-browser tests (Playwright), incl. the subscription lifecycle, axe audits and a 14-language layout sweep
```

The e2e suite drives the production build in Chromium at phone size and runs the spec's QA checklist end to end: onboarding, add / edit / delete, goal reached / exceeded, month switching, persistence across reloads, theme switching, CSV round-trip, offline use (including switching to every language offline), time-zone safety, keyboard operation and WCAG 2 A/AA audits in both themes. `e2e/onboarding.spec.ts` covers the five-step flow in all 14 languages; `e2e/subscription.spec.ts` covers the subscription lifecycle (trial, cancellation, expiry, failed payment, restore, offline); `e2e/i18n.spec.ts` checks that every screen and sheet fits without overflow or clipped text at 320 × 568, 390 × 844 and 1280 × 800, and that Arabic and Urdu are properly mirrored. The browser tests run against a build with a *pretend Google Play* (`npm run build:mock`, done automatically); `npm run verify:release` proves the real build contains none of it. Set `CHROMIUM_PATH` if your Chromium isn't at `/opt/pw-browsers/chromium`. `SHOTS_DIR=/some/dir npx playwright test e2e/visual.spec.ts` captures a screenshot tour for design review.

## Architecture

```
src/
  domain/    Pure TypeScript. No React, no DOM, no storage.
             types · dates · money · calculations · goals · summary · appState
             validation · usecases · csv
  data/      schema (validate what's read back) · persistence (one atomic JSON document)
  state/     AppStore (useSyncExternalStore) — use case → persist → publish
  billing/   subscription rules (pure) · EntitlementStore · Google Play gateway · pretend Play for dev/tests
  format/    Intl-based money / date / number formatters, currency catalogue + search, live amount-field grouping, locale detection
  i18n/      languages (the list) · registry (lazy loaders) · createTranslator · provider
             locales/<code>.ts — one dictionary per language, typed against English
  ui/        components/ · screens/ · sheets/ · hooks/
  styles/    tokens (light + dark) · base · components · screens
```

```
UI  →  store actions  →  use cases (pure)  →  persistence  →  localStorage
                 ↑                                  
      MonthSummary (pure, derived from entries)  ← every number on screen
```

- **Every displayed number is derived** from the stored entries by pure functions in `domain/calculations.ts` (`calculateMonthlyIncome`, `calculateGoalProgress`, `calculateRequiredDailyIncome`, `calculateBestDay`, `calculateIncomeStreak`, …) and assembled by `buildMonthSummary`. Nothing is duplicated in UI code, and nothing is hard-coded.
- **Writes are safe.** The store runs a validated use case, *persists first*, and only then publishes the new state — if the write fails, the screen never shows data that isn't saved, and the user gets a plain message. All data lives in a single storage key, so a save is atomic: an interrupted write leaves the old document or the new one, never a mix.
- **Reads are defensive.** Stored data is re-validated on load; bad records are dropped and counted rather than trusted. Text that can't be parsed at all is kept as a backup and the user is offered *Try again* / *Start fresh* — nothing is overwritten silently.
- **Sync-ready.** `Persistence` is the only seam to storage; a sync layer can wrap or replace it. Entries have stable ids and created / updated timestamps.

### Decisions worth knowing

| Topic | Decision |
| --- | --- |
| **Money** | Stored as integer *hundredths of the major unit* for every currency — no floats, no drift. Using one scale for all currencies means switching currency never rewrites data. Zero-decimal currencies (JPY, KRW) reject fractions. |
| **Dates** | Entry dates are `YYYY-MM-DD` strings — the calendar day the user meant. All arithmetic goes through UTC internally, so time zones and DST cannot shift a date. `createdAt` / `updatedAt` are separate UTC instants. "Today" is re-read on focus and every 30 s, so it follows midnight and time-zone changes. |
| **Goals** | One goal per month, carried forward until changed. Changing the goal in Settings ("from this month on") or for a month never alters earlier months — the previous value is pinned first. `0` means "no goal": the dashboard still works and simply offers *Set goal*. |
| **Currency** | Chosen explicitly during onboarding, *before* the goal — never pre-selected, never assumed (the device's likely currency is only offered as a suggestion). One currency for the whole app. Changing it later asks first, explains that **nothing is converted**, keeps every number, and relabels entries. There are no exchange rates anywhere in the app. |
| **Name** | An optional nickname (≤ 40 characters, any script) stored with the settings and used to greet you. Control and bidi-override characters are stripped; it is rendered as text only and wrapped in Unicode isolates so a name in another script cannot scramble the sentence around it. |
| **Daily targets** | *Required per day* = remaining ÷ remaining days (including today), rounded **up** to a whole unit so following it never leaves the goal short. It's hidden for past and future months. |
| **Progress** | The ring is capped at 100 %, the numbers are not ("114 % of goal", "€420 over goal"). "100 %" only appears once the goal is truly met. |
| **Amount input** | Digits are grouped live as you type, in the language's own style (`3 000`, `3,000`, `3.000`, `3,00,000`). Accepts `.` or `,` as the decimal mark, understands pasted `1,234.50` / `1.234,50`, and reads Arabic-Indic, Persian, Devanagari, Bengali and full-width digits. Locale decides symbol placement and separators via `Intl`. |
| **CSV** | `Date,Amount,Currency,Note`, ISO dates, `.` decimals, UTF-8 with BOM (Excel-friendly). Notes that would be read as spreadsheet formulas are neutralised. Import never overwrites: it previews what will happen, skips duplicates and other-currency rows, and reports unreadable rows. |
| **Privacy** | No accounts, analytics or network calls. A production Content-Security-Policy (`connect-src 'self'`) means the app *cannot* talk to another server even by mistake; an e2e test asserts no external request is made. Amounts and notes are never logged. |

### Subscription (Google Play Billing)

```
Google Play  →  gateway (native plugin)  →  decideAccess (pure rules, src/billing/entitlement.ts)  →  EntitlementStore  →  the app
```

* **Google Play is the source of truth**, and it stops listing a subscription once it has really ended. So the rules are small and exhaustively tested: *listed & auto-renewing* → unlocked; *listed & cancelled* → unlocked until the paid period ends; *pending payment* → not yet; *not listed* → locked (expired, refunded, or payment failed past the grace period). A free trial, a renewal and a payment grace period all simply look like "still listed".
* **Offline**: a successful check is honoured for 72 hours when Google Play can't be reached, then the app asks to reconnect (it never claims the subscription ended on a connection failure). Turning the device clock back cannot extend it.
* **Price and trial come from Google Play** (`getSubscriptionOffer`), formatted for the person's country — the app never hard-codes a price, and never promises a trial the account has already used.
* **Purchases are acknowledged immediately** (Google refunds unacknowledged ones after 3 days); the check repeats at launch, on returning to the foreground, when Google reports a change, and every 6 hours.
* **No Stripe, no card details**: payment is Google Play's. The app has no INTERNET use of its own and the page CSP is `connect-src 'self'`.
* **The pretend Google Play** used by development and the browser tests is compiled out of release builds; `scripts/verify-release-build.mjs` fails CI if any trace of it ships.
* **Anti-tampering on the device**: every purchase's Google signature is verified against the app's Play licence key (release builds refuse to build without it), and the offline memory is stamped with an Android Keystore key and rejects a turned-back clock — see [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) for every bypass considered.
* **Limit**: the check runs on the device. Server-side verification, Google's real-time notifications and Play Integrity (which need your own Google Cloud project and service account) are **not** implemented; `SECURITY_REVIEW.md` says exactly what they would need.

### Android app

The web build is bundled into an Android app with Capacitor 8 (`android/`, `capacitor.config.ts`). Everything needed to ship it is in
[`docs/PLAY_CONSOLE_CHECKLIST.md`](docs/PLAY_CONSOLE_CHECKLIST.md) (beginner step-by-step) and [`docs/ANDROID_RELEASE.md`](docs/ANDROID_RELEASE.md) (technical reference), with [`docs/TESTING.md`](docs/TESTING.md) separating simulated tests from the real Google Play test,
with the store texts, [privacy policy](docs/PRIVACY_POLICY.md) and [Data safety answers](docs/PLAY_DATA_SAFETY.md) alongside.

```bash
npm run android:key      # create your upload key + android/keystore.properties (password typed privately)
npm run android:sync     # build the real (non-test) web app, check it, copy it into android/
npm run android:bundle   # → android/app/build/outputs/bundle/release/app-release.aab (needs your upload key, see the guide)
```

> The Android project is built for real by CI on GitHub (job `android`: compile, native unit tests, a refusal test for a missing licence key, and a signed-release rehearsal with a throwaway key, which also runs the pre-build key check and the post-build signature check used by the manual "Android bundle" workflow). It has not been installed on a phone by the author, and **no real Google Play payment has been tested yet** — see `docs/TESTING.md` for the phone test.

### Languages and localisation

All user-facing text lives in `src/i18n/locales/<code>.ts`, one file per language, each typed against the English dictionary — a missing or misspelt key is a compile error, and a unit test also checks every language for completeness, matching `{placeholders}`, plural categories and leftover English. Each language is a separate lazily loaded chunk (3–5 kB gzipped); English is always bundled as the fallback, so a string that is somehow absent shows the English text rather than a key. The service worker precaches every chunk, so any language works offline.

- **Choosing** — the first onboarding step lists the 14 languages in their own scripts; picking one switches the interface at once. It is stored with the settings and mirrored to `freelanche:lang`, which `public/theme-init.js` reads before first paint, so the `lang`/`dir` attributes (and therefore fonts and RTL) are right from the first frame. It can be changed in Settings at any time. Existing users keep their language and are not sent through onboarding again; the name defaults to empty.
- **Formatting** — numbers, currency, dates, month names, percentages, plurals and the first day of the week all come from `Intl` for the language's regional locale (or the device's, when it already speaks that language). The Gregorian calendar is always used. Plurals use `Intl.PluralRules`, so Arabic (six forms) and Russian (three) are correct.
- **Right-to-left** — Arabic and Urdu set `dir="rtl"`; the layout uses CSS logical properties, directional icons flip, the progress dots and navigation order mirror, and the chart plots time left to right as numbers do everywhere. Amounts and numeric fields stay left-to-right inside RTL pages.
- **Fonts** — no web fonts are downloaded (the app makes no network requests). Each script gets a system font stack (`:lang(zh)`, `:lang(ja)`, `:lang(hi)`, `:lang(bn)`, `:lang(ar)`, `:lang(ur)`), taller line heights for scripts with stacked marks, and no letter-spacing or forced capitals on connected or case-less scripts.

**To add a language:** add an entry to `src/i18n/languages.ts`, create `src/i18n/locales/<code>.ts` with every key of `en.ts`, and register its loader in `src/i18n/registry.ts`. The tests tell you what is still missing.

> The translations were written without a professional translator. Native-speaker review is recommended before release, especially for Hindi, Bengali, Urdu and Arabic.

### Accessibility

Semantic landmarks and headings; every control has an accessible name; modals trap focus, mark the page behind them `inert`, close on Escape and return focus; the chart is operable as a slider (← → Home End) with a text summary; ≥ 44 px touch targets (tested); colour is never the only signal; AA contrast (audited with axe in light and dark); `prefers-reduced-motion` disables the count-up, ring celebration and transitions; text scales with the user's font size.

### Deliberately not built

Per the product brief — invoices, clients, expenses, taxes, budgets, bank sync, social features, ads. Accounts and a backend were left out on purpose: the Google account behind Google Play is the account. The domain layer keeps entries, goals and settings separate so they can be added later.

**Reminders** (spec §75, "optional") were left out: browsers cannot reliably fire scheduled local notifications for an installed web app without a push server, which would break the "no network, no account" promise. A native wrapper could add this with local notifications, off by default.

## Tech

React 19 · TypeScript (strict) · Vite · no runtime dependencies besides React and Capacitor's tiny core · hand-written SVG chart and icons · ~108 KB gzipped JS plus one small chunk per language, loaded on demand.
