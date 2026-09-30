import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { freezeClock, goTo, seed } from './helpers';

/**
 * Automated WCAG 2 A/AA audit (including colour contrast) of every screen and
 * sheet, in both themes. Serious or critical findings fail the build.
 */

const ENTRIES = [
  { date: '2026-09-01', amount: 500, note: 'Website redesign' },
  { date: '2026-09-05', amount: 720, note: 'Brand identity' },
  { date: '2026-09-14', amount: 120 },
  { date: '2026-09-15', amount: 200, note: 'Logo tweaks' },
  { date: '2026-08-10', amount: 2700 },
];

// Audit the settled UI, not a frame from the middle of a fade-in.
test.use({ reducedMotion: 'reduce' });

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    blocking.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    `${label} has accessibility violations`,
  ).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`every screen passes axe in ${theme} mode`, async ({ page }) => {
    await freezeClock(page);
    await seed(page, { entries: ENTRIES, theme });
    await page.goto('/');
    await page.waitForTimeout(400);

    await audit(page, `${theme} home`);
    await goTo(page, 'History');
    await audit(page, `${theme} history`);
    await page.getByRole('button', { name: 'Show calendar' }).click();
    await audit(page, `${theme} history calendar`);
    await goTo(page, 'Insights');
    await audit(page, `${theme} insights`);
    await goTo(page, 'Settings');
    await audit(page, `${theme} settings`);

    await goTo(page, 'Home');
    await page.getByRole('button', { name: 'Add income' }).click();
    await audit(page, `${theme} add sheet`);
    await page.getByLabel('Amount').fill('0');
    await page.getByRole('dialog').getByRole('button', { name: 'Add income' }).click();
    await audit(page, `${theme} add sheet with error`);
    await page.keyboard.press('Escape');
  });
}

test('states: empty, no goal, goal reached, goal exceeded pass axe', async ({ browser }) => {
  for (const [name, entries, goal] of [
    ['empty', [], 3000],
    ['no goal', [{ date: '2026-09-02', amount: 900 }], 0],
    ['reached', [{ date: '2026-09-02', amount: 3000 }], 3000],
    ['exceeded', [{ date: '2026-09-02', amount: 3420 }], 3000],
  ] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'Europe/Berlin', reducedMotion: 'reduce' });
    const page = await context.newPage();
    await freezeClock(page);
    await seed(page, { entries: [...entries], goal });
    await page.goto('/');
    await page.waitForTimeout(300);
    await audit(page, name);
    await context.close();
  }
});

test('onboarding and its currency list pass axe', async ({ page }) => {
  await freezeClock(page);
  await page.goto('/');
  await page.locator('.splash').click();
  await audit(page, 'welcome');
  await page.getByRole('button', { name: 'Get started' }).click();
  await audit(page, 'goal');
  await page.getByRole('button', { name: 'Continue' }).click();
  await audit(page, 'currency');
});
