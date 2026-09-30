# Freelanche

A calm, offline-first income tracker for freelancers. Think of a water-tracking app — but for the money you earn.

**Open the app → see your progress → add income → done.**

No account. No ads. No network. Your data never leaves the device.

## What it does

- **Home** — earned this month inside a goal ring, what's left, what to earn per day to reach the goal, today vs yesterday, daily average, best day, and a cumulative income chart with the goal as a reference line.
- **Add income** — one bottom sheet: amount, optional note, date (defaults to today), quick-add buttons. Three taps for the usual case.
- **History** — entries grouped by day, edit / delete (with confirmation), and a simple calendar to look at a single day.
- **Insights** — best day, average per working day, days with income, income streak, and a neutral comparison with last month. Nothing is shown that the data can't support.
- **Settings** — currency, monthly goal, light / dark / system theme, English / Русский, CSV export & import, delete everything.
- Month navigation across every screen, a different goal per month, decimal amounts, seven main currencies (plus 18 more).

## Run it

```bash
npm install
npm run dev          # development server
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build at http://127.0.0.1:4173
```

It's a PWA: open it on a phone, "Add to Home Screen", and it behaves like a native app — including with no connectivity at all (a small service worker precaches the whole build).

### Tests

```bash
npm test             # 160+ unit tests (Vitest): calculations, dates, money, CSV, goals, store, persistence, i18n
npm run lint         # ESLint incl. React hooks rules
npm run test:e2e     # ~50 real-browser tests (Playwright) against the production build, incl. an axe accessibility audit
```

The e2e suite drives the production build in Chromium at phone size and runs the spec's QA checklist end to end: onboarding, add / edit / delete, goal reached / exceeded, month switching, persistence across reloads, theme switching, CSV round-trip, offline use, time-zone safety, Russian, keyboard operation and WCAG 2 A/AA audits in both themes. Set `CHROMIUM_PATH` if your Chromium isn't at `/opt/pw-browsers/chromium`. `SHOTS_DIR=/some/dir npx playwright test e2e/visual.spec.ts` captures a screenshot tour for design review.

## Architecture

```
src/
  domain/    Pure TypeScript. No React, no DOM, no storage.
             types · dates · money · calculations · goals · summary · appState
             validation · usecases · csv
  data/      schema (validate what's read back) · persistence (one atomic JSON document)
  state/     AppStore (useSyncExternalStore) — use case → persist → publish
  format/    Intl-based money / date / percent formatters, currencies, locale detection
  i18n/      en + ru dictionaries (typed keys, plural rules), provider
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
| **Currency change** | One currency for the whole app. Changing it asks first, explains that **nothing is converted**, keeps every number, and relabels entries. |
| **Daily targets** | *Required per day* = remaining ÷ remaining days (including today), rounded **up** to a whole unit so following it never leaves the goal short. It's hidden for past and future months. |
| **Progress** | The ring is capped at 100 %, the numbers are not ("114 % of goal", "€420 over goal"). "100 %" only appears once the goal is truly met. |
| **Amount input** | Accepts `.` or `,` as the decimal mark and understands pasted `1,234.50` / `1.234,50`. Locale decides symbol placement and separators via `Intl`. |
| **CSV** | `Date,Amount,Currency,Note`, ISO dates, `.` decimals, UTF-8 with BOM (Excel-friendly). Notes that would be read as spreadsheet formulas are neutralised. Import never overwrites: it previews what will happen, skips duplicates and other-currency rows, and reports unreadable rows. |
| **Privacy** | No accounts, analytics or network calls. A production Content-Security-Policy (`connect-src 'self'`) means the app *cannot* talk to another server even by mistake; an e2e test asserts no external request is made. Amounts and notes are never logged. |

### Accessibility

Semantic landmarks and headings; every control has an accessible name; modals trap focus, mark the page behind them `inert`, close on Escape and return focus; the chart is operable as a slider (← → Home End) with a text summary; ≥ 44 px touch targets (tested); colour is never the only signal; AA contrast (audited with axe in light and dark); `prefers-reduced-motion` disables the count-up, ring celebration and transitions; text scales with the user's font size.

### Deliberately not built

Per the product brief — invoices, clients, expenses, taxes, budgets, bank sync, social features. The domain layer keeps entries, goals and settings separate so they can be added later.

**Reminders** (spec §75, "optional") were left out: browsers cannot reliably fire scheduled local notifications for an installed web app without a push server, which would break the "no network, no account" promise. A native wrapper could add this with local notifications, off by default.

## Tech

React 19 · TypeScript (strict) · Vite · no runtime dependencies besides React · hand-written SVG chart and icons · ~99 KB gzipped JS.
