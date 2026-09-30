import { expect, type Page } from '@playwright/test';

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
    onboarded?: boolean;
  } = {},
) {
  const { entries = [], goal = 3000, currency = 'EUR', theme = 'light', language = 'en', onboarded = true } = options;
  const doc = {
    schemaVersion: 1,
    settings: {
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
      }
    },
    { key: STORAGE_KEY, value: doc },
  );
}

/** The first-launch flow: skip splash → goal → currency → done. */
export async function onboard(page: Page, options: { goal?: string; currency?: string } = {}) {
  const { goal = '3000', currency = 'Euro' } = options;
  await page.goto('/');
  await page.locator('.splash').click();
  await page.getByRole('button', { name: 'Get started' }).click();
  if (goal) await page.getByLabel('Monthly goal amount').fill(goal);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText(currency, { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start tracking' }).click();
  await expect(page.getByRole('button', { name: 'Add income' })).toBeVisible();
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

export const goTo = (page: Page, tab: 'Home' | 'History' | 'Insights' | 'Settings') =>
  page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: tab }).click();
