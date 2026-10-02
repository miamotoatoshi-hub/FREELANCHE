import { expect, test, type Page } from '@playwright/test';
import { LANGUAGES, dict, freezeClock, goTo, onboard, seed, storedData, visible } from './helpers';

/**
 * The first-launch flow, in its required order:
 *   1 language → 2 name → 3 currency → 4 income goal
 * Run against the production build in a real browser (mobile viewport).
 */

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const next = (page: Page, language = 'en') => page.getByRole('button', { name: dict(language)['common.continue'] });

test.describe('order and content', () => {
  test('asks language → name → currency → goal, then greets you by name', async ({ page }) => {
    await page.goto('/');

    // 1 — the very first screen is the language question
    await expect(title(page)).toHaveText('What language would you like to use in the app?');
    await expect(page.getByText('Step 1 of 4').first()).toBeVisible();
    await next(page).click();

    // 2 — name
    await expect(title(page)).toHaveText('What should we call you?');
    await expect(page.getByText('Step 2 of 4').first()).toBeVisible();
    await page.getByLabel('Your name or nickname').fill('Alex');
    await next(page).click();

    // 3 — currency, asked before any goal
    await expect(title(page)).toHaveText('Which currency would you like to use?');
    await expect(page.getByText('Step 3 of 4').first()).toBeVisible();
    await expect(page.getByLabel('Monthly goal amount')).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search currencies' }).fill('euro');
    await page.locator('label.currency', { hasText: 'Euro' }).click();
    await next(page).click();

    // 4 — goal, with the chosen currency beside the amount
    await expect(title(page)).toHaveText('What is your monthly income goal?');
    await expect(page.getByText('Step 4 of 4').first()).toBeVisible();
    await expect(page.locator('.amount-field__symbol')).toHaveText('€');
    await page.getByLabel('Monthly goal amount').fill('3000');
    await page.getByRole('button', { name: 'Start tracking' }).click();

    // the dashboard is personalised and everything is saved
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your income dashboard, .*Alex/);
    await expect(page.getByRole('status')).toContainText('Welcome,');
    await expect(page.getByRole('status')).toContainText('Alex');
    await expect(page.locator('.hero')).toContainText('Monthly goal: €3,000');
    expect((await storedData(page)).settings).toMatchObject({
      language: 'en',
      name: 'Alex',
      currency: 'EUR',
      defaultMonthlyGoal: 300000,
      onboardingCompleted: true,
    });
  });

  test('shows a progress indicator and a back button that keeps your input', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0); // nothing to go back to
    await next(page).click();
    await page.getByLabel('Your name or nickname').fill('Sam');
    await next(page).click();
    await page.getByRole('searchbox', { name: 'Search currencies' }).fill('yen');
    await page.locator('label.currency', { hasText: 'Japanese Yen' }).click();
    await next(page).click();
    await page.getByLabel('Monthly goal amount').fill('300000');

    await page.getByRole('button', { name: 'Back' }).click(); // → currency
    await expect(page.getByRole('radio', { name: /Japanese Yen/ })).toBeChecked();
    await page.getByRole('button', { name: 'Back' }).click(); // → name
    await expect(page.getByLabel('Your name or nickname')).toHaveValue('Sam');
    await page.getByRole('button', { name: 'Back' }).click(); // → language
    await expect(title(page)).toHaveText('What language would you like to use in the app?');

    await next(page).click();
    await next(page).click();
    await next(page).click(); // currency is still chosen, so no need to pick again
    await expect(page.getByLabel('Monthly goal amount')).toHaveValue('300,000'); // goal kept too
  });

  test('the name is optional, a nickname is fine, and an over-long one gets a friendly error', async ({ page }) => {
    await page.goto('/');
    await next(page).click();
    const name = page.getByLabel('Your name or nickname');
    await name.fill('x'.repeat(50));
    await next(page).click();
    await expect(page.getByRole('alert')).toHaveText('Keep your name under 40 characters.');
    await expect(title(page)).toHaveText('What should we call you?'); // stays put
    await name.fill('Sunny 🌞');
    await next(page).click();
    await expect(title(page)).toHaveText('Which currency would you like to use?');
    expect((await storedData(page)).settings.name).toBe('Sunny 🌞');

    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click(); // skipping clears it
    expect((await storedData(page)).settings.name).toBe('');
  });

  test('no goal is required: "I\'ll set it later" lands on a working dashboard', async ({ page }) => {
    await onboard(page, { name: null, goal: '' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your income dashboard'); // no name, no comma
    await expect(page.getByRole('button', { name: 'Set goal' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Welcome!');
  });
});

test.describe('language', () => {
  test('all 12 languages can be chosen, and the interface changes the moment one is picked', async ({ page }) => {
    await page.goto('/');
    for (const language of LANGUAGES) {
      const d = dict(language.code);
      await page.locator('label.language', { hasText: language.nativeName }).click();
      await expect(title(page)).toHaveText(d['onboarding.language.title']!);
      await expect(page.getByRole('button', { name: d['common.continue'] })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', language.dir);
      await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${language.code}`));
      await expect(page.getByRole('radio', { name: new RegExp(language.nativeName.replace(/[()]/g, '\\$&')) })).toBeChecked();
    }
  });

  test('every language is written in its own script, with the English name beneath', async ({ page }) => {
    await page.goto('/');
    const labels = await page.locator('label.language').allInnerTexts();
    expect(labels).toHaveLength(12);
    for (const language of LANGUAGES) {
      const label = labels.find((text) => text.includes(language.nativeName))!;
      expect(label, language.nativeName).toBeTruthy();
      if (language.nativeName !== language.englishName) expect(label).toContain(language.englishName);
    }
  });

  test('the chosen language is remembered across a refresh — even mid-onboarding', async ({ page }) => {
    await page.goto('/');
    await page.locator('label.language', { hasText: 'Português' }).click();
    await expect(title(page)).toHaveText(dict('pt')['onboarding.language.title']!);
    await page.reload();
    await expect(title(page)).toHaveText(dict('pt')['onboarding.language.title']!);
    await expect(page.getByRole('radio', { name: /Português/ })).toBeChecked();
    expect((await storedData(page)).settings.language).toBe('pt');
  });

  test('the whole flow works end to end in every language', async ({ page }) => {
    test.setTimeout(120_000);
    for (const language of LANGUAGES) {
      await page.goto('/');
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await onboard(page, { language: language.code, name: 'Alex', currency: 'USD', goal: '3000' });
      const d = dict(language.code);
      expect(visible(await page.getByRole('heading', { level: 1 }).textContent())).toBe(d['greeting.dashboard']!.replace('{name}', 'Alex'));
      expect((await storedData(page)).settings).toMatchObject({ language: language.code, name: 'Alex', currency: 'USD', onboardingCompleted: true });
    }
  });

  test('right-to-left languages mirror the onboarding layout', async ({ page }) => {
    await page.goto('/');
    await page.locator('label.language', { hasText: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await next(page, 'ar').click();
    // the step dots run right-to-left and the text field right-aligns
    const input = page.getByLabel(dict('ar')['name.label']!);
    expect(await input.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl'); // dir="auto" on an Arabic placeholder-less field
    expect(await page.locator('.dots li').first().evaluate((el) => el.getBoundingClientRect().x)).toBeGreaterThan(
      await page.locator('.dots li').last().evaluate((el) => el.getBoundingClientRect().x),
    );
    await input.fill('Alex'); // a Latin name in an Arabic UI still works
    await next(page, 'ar').click();
    await expect(page.locator('.search__icon')).toBeVisible();
    const icon = await page.locator('.search__icon').boundingBox();
    const field = await page.locator('.search').boundingBox();
    expect(icon!.x).toBeGreaterThan(field!.x + field!.width / 2); // the magnifier sits at the start = right
  });
});

test.describe('currency', () => {
  test('is never assumed: nothing is pre-selected, and you cannot continue without choosing', async ({ page }) => {
    await page.goto('/');
    await next(page).click();
    await next(page).click(); // skip name
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
    await next(page).click();
    await expect(page.getByRole('alert')).toHaveText('Choose a currency to continue.');
    await expect(title(page)).toHaveText('Which currency would you like to use?');
    // a suggestion is offered for the device (en-US → US Dollar) but not selected
    await expect(page.locator('.currencies__heading').first()).toHaveText('Suggested for your device');
    await expect(page.locator('label.currency').first()).toContainText('US Dollar');
    await expect(page.locator('label.currency').first().locator('input')).not.toBeChecked();
  });

  test('is searchable by name, code and symbol, in the interface language or English', async ({ page }) => {
    await page.goto('/');
    await next(page).click();
    await next(page).click();
    const search = page.getByRole('searchbox', { name: 'Search currencies' });
    const rows = page.locator('label.currency');

    expect(await rows.count()).toBeGreaterThan(100); // a comprehensive list
    await search.fill('rub');
    await expect(rows.first()).toContainText('Russian Ruble');
    await search.fill('₹');
    await expect(rows.first()).toContainText('Indian Rupee');
    await search.fill('US dollar');
    await expect(rows.first()).toContainText('USD');
    await search.fill('yuan');
    await expect(page.locator('label.currency', { hasText: 'Chinese Yuan' })).toBeVisible();
    await expect(page.getByRole('status').last()).toContainText('currenc');

    await search.fill('nothing like this');
    await expect(page.getByText('No currency matches “nothing like this”.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(search).toHaveValue('');
    await expect(rows.first()).toBeVisible();

    await search.fill('brl');
    await search.press('Enter'); // Enter picks the best match
    await expect(page.getByRole('radio', { name: /Brazilian Real/ })).toBeChecked();
  });

  test('shows code, familiar name and symbol, and covers the currencies in the brief', async ({ page }) => {
    await page.goto('/');
    await next(page).click();
    await next(page).click();
    for (const [code, name, symbol] of [
      ['EUR', 'Euro', '€'],
      ['USD', 'US Dollar', '$'],
      ['RUB', 'Russian Ruble', 'RUB'],
      ['CNY', 'Chinese Yuan', 'CN¥'],
      ['JPY', 'Japanese Yen', '¥'],
      ['INR', 'Indian Rupee', '₹'],
      ['GBP', 'British Pound', '£'],
      ['BRL', 'Brazilian Real', 'R$'],
    ]) {
      const row = page.locator('label.currency', { hasText: name });
      await expect(row.first(), code).toBeVisible();
      await expect(row.first()).toContainText(code!);
      await expect(row.first().locator('.currency__symbol')).toHaveText(symbol!);
    }
  });

  test('the goal field shows the chosen currency: €2,000 · $2,000 · ₽200,000', async ({ page }) => {
    for (const [query, symbol, example] of [
      ['euro', '€', '2,000'],
      ['us dollar', '$', '2,000'],
      ['rub', 'RUB', '200,000'],
    ]) {
      await page.goto('/');
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await next(page).click();
      await next(page).click();
      await page.getByRole('searchbox', { name: 'Search currencies' }).fill(query!);
      await page.locator('label.currency').first().click();
      await next(page).click();
      await expect(page.locator('.amount-field__symbol')).toHaveText(symbol!);
      await expect(page.getByLabel('Monthly goal amount')).toHaveAttribute('placeholder', example!);
    }

    // the same ruble goal in a Russian interface: ₽ and a Russian-style number
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const ru = dict('ru');
    await page.locator('label.language', { hasText: 'Русский' }).click();
    await page.getByRole('button', { name: ru['common.continue'] }).click();
    await page.getByRole('button', { name: ru['onboarding.name.skip'] }).click();
    await page.getByRole('searchbox', { name: ru['currency.search'] }).fill('RUB');
    await page.locator('label.currency').first().click();
    await page.getByRole('button', { name: ru['common.continue'] }).click();
    const goal = page.getByLabel(ru['goal.amountLabel']!);
    await expect(page.locator('.amount-field__symbol')).toHaveText('₽');
    await expect(goal).toHaveAttribute('placeholder', /^200\s000$/);
    await goal.pressSequentially('200000');
    await expect(goal).toHaveValue(/^200\s000$/);
  });

  test('the goal input groups digits for the locale and accepts any numeral system', async ({ page }) => {
    await onboard(page, { goal: '' });
    await goTo(page, 'Settings');
    await page.getByRole('button', { name: /Monthly goal/ }).click();
    const goal = page.getByRole('dialog').getByLabel('Monthly goal amount');
    await goal.pressSequentially('1234567.5');
    await expect(goal).toHaveValue('1,234,567.5');
    await goal.fill('٣٠٠٠'); // Arabic-Indic digits typed on an Arabic keyboard
    await expect(goal).toHaveValue('3,000');
    await goal.fill('२५०००'); // Devanagari
    await expect(goal).toHaveValue('25,000');
    await goal.fill('');
    await goal.pressSequentially('12345');
    await goal.press('Home');
    await goal.press('Delete'); // editing in the middle keeps the caret and re-groups
    await expect(goal).toHaveValue('2,345');
  });

  test('the selected currency is used consistently everywhere', async ({ page }) => {
    await onboard(page, { currency: 'british pound', goal: '3000' });
    await expect(page.locator('.hero')).toContainText('Monthly goal: £3,000');
    await page.getByRole('button', { name: 'Add income' }).click();
    await expect(page.locator('.amount-field__symbol')).toHaveText('£');
    await page.getByLabel('Amount').fill('250');
    await page.getByRole('dialog').getByRole('button', { name: 'Add income' }).click();
    await expect(page.locator('.ring__center')).toContainText('£250');
    await goTo(page, 'History');
    await expect(page.locator('.entry__amount').first()).toHaveText('£250');
    await goTo(page, 'Insights');
    await expect(page.locator('.insight-total')).toContainText('£250');
    await goTo(page, 'Settings');
    await expect(page.getByRole('button', { name: /Currency/ })).toContainText('GBP');
    expect((await storedData(page)).entries[0]).toMatchObject({ currency: 'GBP', amount: 25000 });
  });
});

test.describe('after onboarding', () => {
  test('a refresh keeps language, name, currency and goal — and never asks again', async ({ page }) => {
    await onboard(page, { language: 'es', name: 'Marta', currency: 'dólar', goal: '4000' });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Tu panel de ingresos, .*Marta/);
    await expect(page.locator('.hero')).toContainText(/Meta mensual:\s*4000|Meta mensual:\s*4\.000/);
    await expect(page.getByRole('heading', { name: dict('es')['onboarding.language.title']! })).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('lang', /^es/);
  });

  test('people who finished onboarding before names and languages existed are not asked again', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'freelanche:data',
        JSON.stringify({
          schemaVersion: 1,
          settings: { currency: 'EUR', defaultMonthlyGoal: 300000, theme: 'light', onboardingCompleted: true, language: 'ru' },
          entries: [{ id: 'old', amount: 50000, currency: 'EUR', date: '2026-09-03', createdAt: '2026-09-03T10:00:00.000Z', updatedAt: '2026-09-03T10:00:00.000Z' }],
          goals: [],
        }),
      );
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ваша панель доходов'); // no name yet
    await expect(page.locator('.ring__center')).toContainText('500');
    await expect(page.getByText(dict('ru')['onboarding.name.title']!)).toHaveCount(0);
  });

  test('Settings lets you change name, language, currency and goal — and they persist', async ({ page }) => {
    await onboard(page, { name: 'Alex', currency: 'euro', goal: '3000' });
    await goTo(page, 'Settings');

    // name
    await page.getByRole('button', { name: /^Name/ }).click();
    const name = page.getByRole('dialog').getByLabel('Your name or nickname');
    await expect(name).toHaveValue('Alex');
    await name.fill('Sam');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByRole('button', { name: /^Name/ })).toContainText('Sam');

    // goal
    await page.getByRole('button', { name: /Monthly goal/ }).click();
    await page.getByRole('dialog').getByLabel('Monthly goal amount').fill('5000');
    await page.getByRole('button', { name: 'Save goal' }).click();

    // currency (no entries yet, so it applies at once)
    await page.getByRole('button', { name: /^Currency/ }).click();
    await page.getByRole('dialog').getByRole('searchbox', { name: 'Search currencies' }).fill('pound');
    await page.getByRole('dialog').locator('label.currency', { hasText: 'British Pound' }).click();
    await expect(page.getByRole('button', { name: /^Currency/ })).toContainText('GBP');

    // language
    await page.getByRole('button', { name: /^Language/ }).click();
    await page.locator('label.language', { hasText: 'Deutsch' }).count(); // not offered
    await page.locator('label.language', { hasText: 'Français' }).click();
    await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();
    expect((await storedData(page)).settings).toMatchObject({ name: 'Sam', language: 'fr', currency: 'GBP', defaultMonthlyGoal: 500000 });
    await goTo(page, 'Home', 'fr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Votre tableau de bord des revenus, .*Sam/);
    await expect(page.locator('.hero')).toContainText(/Objectif mensuel\s*:\s*5[\s\u202f\u00a0]000\s*£GB/);
  });

  test('changing the name updates the greeting at once; clearing it removes the comma', async ({ page }) => {
    await seed(page, { name: 'Alex' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Alex');
    await goTo(page, 'Settings');
    await page.getByRole('button', { name: /^Name/ }).click();
    await page.getByRole('dialog').getByLabel('Your name or nickname').fill('');
    await page.getByRole('button', { name: 'Save name' }).click();
    await goTo(page, 'Home');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your income dashboard');
  });

  test('changing currency later converts nothing: historical amounts keep their numbers', async ({ page }) => {
    await seed(page, { entries: [{ date: '2026-09-03', amount: 1234.5 }], currency: 'EUR', name: 'Alex' });
    await page.goto('/');
    await goTo(page, 'Settings');
    await page.getByRole('button', { name: /^Currency/ }).click();
    await page.getByRole('dialog').getByRole('searchbox').fill('rupee');
    await page.getByRole('dialog').locator('label.currency', { hasText: 'Indian Rupee' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Nothing is converted.');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Change currency' }).click();
    await goTo(page, 'Home');
    await expect(page.locator('.ring__center')).toContainText('₹1,234.50');
    expect((await storedData(page)).entries[0]).toMatchObject({ amount: 123450, currency: 'INR' });
  });
});

test('the greeting is safe for names in any script and cannot inject markup', async ({ page }) => {
  await seed(page, { name: '<img src=x onerror=alert(1)>' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('<img src=x onerror=alert(1)>'); // shown as text
  expect(await page.locator('h1 img').count()).toBe(0);
  await goTo(page, 'Settings');
  expect(visible(await page.getByRole('button', { name: /^Name/ }).innerText())).toContain('<img');
});
