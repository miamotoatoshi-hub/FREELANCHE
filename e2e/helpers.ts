import { expect, type Page } from '@playwright/test';
import { LANGUAGES } from '../src/i18n/languages';
import { ar } from '../src/i18n/locales/ar';
import { bn } from '../src/i18n/locales/bn';
import { en } from '../src/i18n/locales/en';
import { es } from '../src/i18n/locales/es';
import { fr } from '../src/i18n/locales/fr';
import { hi } from '../src/i18n/locales/hi';
import { id } from '../src/i18n/locales/id';
import { ja } from '../src/i18n/locales/ja';
import { pt } from '../src/i18n/locales/pt';
import { ru } from '../src/i18n/locales/ru';
import { ur } from '../src/i18n/locales/ur';
import { zh } from '../src/i18n/locales/zh';

/** The real dictionaries, so tests assert against the strings the app actually ships. */
export const DICTIONARIES: Record<string, Record<string, string>> = { en, zh, hi, es, fr, ar, bn, pt, ru, ur, id, ja };
export { LANGUAGES };
export const dict = (code: string) => DICTIONARIES[code]!;

/** Bidi isolates around inserted names/values are invisible; strip them to compare visible text. */
export const visible = (text: string | null | undefined) => (text ?? '').replace(/[\u2066-\u2069]/g, '');

/** All e2e runs pretend it is mid-September 2026, so dates and month lengths are predictable. */
export const NOW = '2026-09-15T12:00:00';

export const freezeClock = (page: Page, iso = NOW) => page.clock.setFixedTime(new Date(iso));

export const STORAGE_KEY = 'freelanche:data';

interface SeedEntry {
  date: string;
  amount: number; // major units
  note?: string;
}

/** Writes a ready-made, onboarded data document before the app starts. */
export async function seed(
  page: Page,
  options: {
    entries?: SeedEntry[];
    goal?: number;
    currency?: string;
    theme?: 'light' | 'dark' | 'system';
    language?: string;
    name?: string;
    onboarded?: boolean;
  } = {},
) {
  const { entries = [], goal = 3000, currency = 'EUR', theme = 'light', language = 'en', name = '', onboarded = true } = options;
  const doc = {
    schemaVersion: 1,
    settings: {
      name,
      currency,
      defaultMonthlyGoal: goal * 100,
      theme,
      onboardingCompleted: onboarded,
      language,
    },
    entries: entries.map((entry, index) => ({
      id: `seed-${index}`,
      amount: Math.round(entry.amount * 100),
      currency,
      date: entry.date,
      ...(entry.note ? { note: entry.note } : {}),
      createdAt: `${entry.date}T09:${String(index % 60).padStart(2, '0')}:00.000Z`,
      updatedAt: `${entry.date}T09:${String(index % 60).padStart(2, '0')}:00.000Z`,
    })),
    goals: goal > 0 ? [{ id: '2026-09', year: 2026, month: 9, amount: goal * 100 }] : [],
  };
  // Seed once per browser tab, so reloads (and "delete all data") behave like the real app.
  await page.addInitScript(
    ({ key, value }) => {
      if (!window.sessionStorage.getItem('e2e-seeded')) {
        window.sessionStorage.setItem('e2e-seeded', '1');
        window.localStorage.setItem(key, JSON.stringify(value));
        window.localStorage.setItem('freelanche:theme', value.settings.theme);
        window.localStorage.setItem('freelanche:lang', value.settings.language);
      }
    },
    { key: STORAGE_KEY, value: doc },
  );
}

export interface OnboardOptions {
  /** Interface language code to pick on the first screen (default: leave the detected one). */
  language?: string;
  /** Nickname to type; `null` skips the step. */
  name?: string | null;
  /** What to type in the currency search. The first match is chosen. */
  currency?: string;
  /** Goal to type; `''` uses "set it later". */
  goal?: string;
}

/** The first-launch flow, in its real order: language → name → currency → goal. */
export async function onboard(page: Page, options: OnboardOptions = {}) {
  const { language, name = 'Alex', currency = 'Euro', goal = '3000' } = options;
  await page.goto('/');

  // 1 — language
  const info = LANGUAGES.find((l) => l.code === language);
  if (info) await page.locator('label.language', { hasText: info.nativeName }).click();
  const d = dict(language ?? 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(d['onboarding.language.title']!);
  await page.getByRole('button', { name: d['common.continue'] }).click();

  // 2 — name
  if (name !== null) await page.getByLabel(d['name.label']!).fill(name);
  await page.getByRole('button', { name: name === null ? d['onboarding.name.skip'] : d['common.continue'] }).click();

  // 3 — currency (always chosen explicitly)
  await page.getByRole('searchbox', { name: d['currency.search'] }).fill(currency);
  await page.locator('label.currency').first().click();
  await page.getByRole('button', { name: d['common.continue'] }).click();

  // 4 — goal
  if (goal) {
    await page.getByLabel(d['goal.amountLabel']!).fill(goal);
    await page.getByRole('button', { name: d['onboarding.goal.cta'] }).click();
  } else {
    await page.getByRole('button', { name: d['onboarding.goal.skip'] }).click();
  }
  await expect(page.getByRole('navigation', { name: d['nav.label'] })).toBeVisible();
}

/** Opens the sheet, types an amount (and optional note/date), submits. */
export async function addIncome(page: Page, amount: string, options: { note?: string; date?: string } = {}) {
  await page.getByRole('button', { name: 'Add income' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Amount').fill(amount);
  if (options.date) await sheet.getByLabel('Date').fill(options.date);
  if (options.note) await sheet.getByLabel(/Note/).fill(options.note);
  await sheet.getByRole('button', { name: 'Add income' }).click();
  await expect(sheet).toBeHidden();
}

export async function storedData(page: Page) {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'), STORAGE_KEY);
}

/** A stat card by its label, e.g. stat(page, 'Today'). Matches the label only, not the hint text. */
export const stat = (page: Page, label: string) =>
  page.locator('.stat').filter({ has: page.locator('.stat__label', { hasText: new RegExp(`^${label}$`, 'i') }) });

const NAV_KEYS = { Home: 'nav.home', History: 'nav.history', Insights: 'nav.insights', Settings: 'nav.settings' } as const;

/** Opens a tab from the bottom navigation, in whichever language the app is showing. */
export const goTo = (page: Page, tab: keyof typeof NAV_KEYS, language = 'en') =>
  page
    .getByRole('navigation', { name: dict(language)['nav.label'] })
    .getByRole('link', { name: dict(language)[NAV_KEYS[tab]] })
    .click();
