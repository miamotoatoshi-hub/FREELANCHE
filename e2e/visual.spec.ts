import { test } from '@playwright/test';
import { freezeClock, goTo, seed } from './helpers';

/**
 * Screenshot tour for design review. Only runs when SHOTS_DIR is set:
 *   SHOTS_DIR=/tmp/shots npx playwright test e2e/visual.spec.ts
 */
const dir = process.env.SHOTS_DIR;
test.skip(!dir, 'set SHOTS_DIR to capture screenshots');

const ENTRIES = [
  { date: '2026-09-01', amount: 500, note: 'Website redesign' },
  { date: '2026-09-03', amount: 300, note: 'Logo' },
  { date: '2026-09-05', amount: 720, note: 'Brand identity' },
  { date: '2026-09-08', amount: 120 },
  { date: '2026-09-12', amount: 250.5, note: 'Copywriting' },
  { date: '2026-09-14', amount: 120, note: 'Consulting call' },
  { date: '2026-09-15', amount: 200, note: 'Logo tweaks' },
  { date: '2026-09-15', amount: 150, note: 'Stock photos' },
  { date: '2026-08-10', amount: 2700, note: 'August project' },
];

for (const theme of ['light', 'dark'] as const) {
  test(`tour ${theme}`, async ({ page }) => {
    await freezeClock(page);
    await seed(page, { entries: ENTRIES, theme });
    await page.goto('/');

    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/${theme}-1-home.png` });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${dir}/${theme}-1b-home-scrolled.png` });
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.getByRole('button', { name: 'Add income' }).click();
    await page.getByLabel('Amount').fill('300');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/${theme}-2-add-sheet.png` });
    await page.keyboard.press('Escape');

    await goTo(page, 'History');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/${theme}-3-history.png`, fullPage: true });

    await goTo(page, 'Insights');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/${theme}-4-insights.png`, fullPage: true });

    await goTo(page, 'Settings');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/${theme}-5-settings.png`, fullPage: true });
  });
}

test('states', async ({ page }) => {
  await freezeClock(page);

  await seed(page, { entries: [], theme: 'light' });
  await page.goto('/');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/state-empty.png`, fullPage: true });
});

test('goal reached / exceeded / no goal', async ({ browser }) => {
  for (const [name, entries, goal] of [
    ['reached', [{ date: '2026-09-02', amount: 3000 }], 3000],
    ['exceeded', [{ date: '2026-09-02', amount: 3420 }], 3000],
    ['nogoal', [{ date: '2026-09-02', amount: 900 }], 0],
  ] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'Europe/Berlin' });
    const page = await context.newPage();
    await freezeClock(page);
    await seed(page, { entries: [...entries], goal, theme: 'light' });
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/state-${name}.png`, fullPage: true });
    await context.close();
  }
});

test('onboarding + splash', async ({ page }) => {
  await freezeClock(page);
  await page.goto('/');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/onb-0-splash.png` });
  await page.locator('.splash').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/onb-1-welcome.png` });
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/onb-2-goal.png` });
  await page.getByLabel('Monthly goal amount').fill('3000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/onb-3-currency.png`, fullPage: true });
});

test('stress: long amounts, Russian, yen, presets', async ({ browser }) => {
  const cases: { name: string; options: Parameters<typeof seed>[1] }[] = [
    { name: 'big', options: { entries: [{ date: '2026-09-02', amount: 1234567.89 }], goal: 2000000 } },
    { name: 'ru', options: { entries: [{ date: '2026-09-02', amount: 2450.5 }, { date: '2026-09-15', amount: 350, note: 'Логотип' }], goal: 3000, language: 'ru' } },
    { name: 'yen', options: { entries: [{ date: '2026-09-02', amount: 245000 }], goal: 300000, currency: 'JPY' } },
    { name: 'chf', options: { entries: [{ date: '2026-09-02', amount: 2450 }], goal: 3000, currency: 'CHF' } },
  ];
  for (const { name, options } of cases) {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: options?.language === 'ru' ? 'ru-RU' : 'en-US', timezoneId: 'Europe/Berlin' });
    const page = await context.newPage();
    await freezeClock(page);
    await seed(page, { ...options, theme: 'light' });
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/stress-${name}-home.png` });
    await page.getByRole('button', { name: /Add income|Добавить доход/ }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/stress-${name}-sheet.png` });
    await context.close();
  }
});
