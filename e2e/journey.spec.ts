import { expect, test, type Page } from '@playwright/test';
import { LANGUAGES, addIncome, dict, freezeClock, goTo, onboard, seed, stat, storedData } from './helpers';

/**
 * The spec's QA checklist, run against the real production build in a real browser.
 * "Now" is frozen at 15 Sep 2026, so 16 days (15th–30th, inclusive) remain in the month.
 */

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

const hero = (page: Page) => page.locator('.hero');
const ring = (page: Page) => page.locator('.ring__center');

test.describe('dashboard maths', () => {
  test.beforeEach(async ({ page }) => {
    await onboard(page, { goal: '3000', currency: 'Euro' });
  });

  test('case 1 — zero income is calm: 0 %, full goal remaining, no warnings', async ({ page }) => {
    await expect(ring(page)).toContainText('0% of goal');
    await expect(hero(page)).toContainText('€3,000 left');
    await expect(hero(page)).toContainText("Let's make your first entry.");
    await expect(page.getByText(/behind|fail|bad|warning/i)).toHaveCount(0);
  });

  test('cases 2–5 — multiple entries, halfway, reached, exceeded', async ({ page }) => {
    await addIncome(page, '100', { note: 'Logo' });
    await addIncome(page, '200', { note: 'Website' });
    await addIncome(page, '300', { note: 'Copy' });
    await expect(ring(page)).toContainText('€600');
    await expect(stat(page, 'Today')).toContainText('€600');

    await addIncome(page, '900'); // €1,500 = half way
    await expect(ring(page)).toContainText('€1,500');
    await expect(ring(page)).toContainText('50% of goal');
    await expect(hero(page)).toContainText('€1,500 left');
    // €1,500 over the 16 remaining days → 93.75 → rounded up to €94/day
    await expect(stat(page, 'To reach your goal')).toContainText('€94');
    await expect(stat(page, 'To reach your goal')).toContainText('16 days left, including today');

    await addIncome(page, '1500'); // exactly the goal
    await expect(hero(page)).toContainText('Goal reached!');
    await expect(ring(page)).toContainText('100% of goal');
    await expect(stat(page, 'To reach your goal')).toContainText('Goal reached');

    await addIncome(page, '1000'); // €4,000
    await expect(ring(page)).toContainText('€4,000');
    await expect(hero(page)).toContainText('€1,000 over goal');
    await expect(page.getByRole('img', { name: /133% of your monthly goal/ })).toBeVisible();
    await expect(stat(page, 'To reach your goal')).toContainText("You're €1,000 ahead");
    // the arc stays a complete circle — never longer
    await expect(page.locator('.ring__arc')).toHaveAttribute('stroke-dashoffset', '0');
  });

  test('add income takes three taps and updates everything at once', async ({ page }) => {
    await addIncome(page, '2450');
    await expect(ring(page)).toContainText('€2,450');
    await expect(ring(page)).toContainText('81% of goal');
    await expect(hero(page)).toContainText('€550 left');
    await addIncome(page, '300');
    await expect(ring(page)).toContainText('€2,750');
    await expect(ring(page)).toContainText('91% of goal');
    await expect(hero(page)).toContainText('€250 left');
    await expect(page.getByRole('status')).toContainText('Added €300');
    // chart, stats and today are live too
    await expect(stat(page, 'Best day')).toContainText('€2,750');
    await expect(page.locator('.chart__readout')).toContainText('Sep 15 · €2,750');
  });

  test('quick-add buttons add to the amount', async ({ page }) => {
    await page.getByRole('button', { name: 'Add income' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Add €100' }).click();
    await sheet.getByRole('button', { name: 'Add €250' }).click();
    await expect(sheet.getByLabel('Amount')).toHaveValue('350');
    await sheet.getByRole('button', { name: 'Add income' }).click();
    await expect(ring(page)).toContainText('€350');
  });
});

test.describe('input validation', () => {
  test.beforeEach(async ({ page }) => {
    await onboard(page);
    await page.getByRole('button', { name: 'Add income' }).click();
  });

  test('rejects empty and zero amounts with human messages, and keeps the sheet open', async ({ page }) => {
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Add income' }).click();
    await expect(sheet.getByRole('alert')).toHaveText('Enter an amount.');
    await sheet.getByLabel('Amount').fill('0');
    await sheet.getByRole('button', { name: 'Add income' }).click();
    await expect(sheet.getByRole('alert')).toHaveText('The amount must be greater than zero.');
    await expect(sheet).toBeVisible();
    expect((await storedData(page)).entries).toHaveLength(0);
  });

  test('filters letters and minus signs while typing, and groups digits as you go', async ({ page }) => {
    const sheet = page.getByRole('dialog');
    const amount = sheet.getByLabel('Amount');
    await amount.pressSequentially('-12abc3.456');
    await expect(amount).toHaveValue('123.45'); // at most two decimals
    await amount.fill('');
    await amount.pressSequentially('1234567');
    await expect(amount).toHaveValue('1,234,567'); // the locale's grouping appears live
    await amount.fill('');
    await amount.pressSequentially('123.45');
    await sheet.getByRole('button', { name: 'Add income' }).click();
    await expect(ring(page)).toContainText('€123.45');
    expect((await storedData(page)).entries[0].amount).toBe(12345);
  });

  test('rejects amounts above the maximum', async ({ page }) => {
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Amount').fill('999999999');
    await sheet.getByRole('button', { name: 'Add income' }).click();
    await expect(sheet.getByRole('alert')).toHaveText('That amount is too large.');
  });

  test('the note is optional and long notes are refused politely', async ({ page }) => {
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Amount').fill('10');
    await sheet.getByLabel(/Note/).fill('x'.repeat(150));
    await sheet.getByRole('button', { name: 'Add income' }).click();
    await expect(sheet.getByRole('alert')).toContainText('Keep the note under 120 characters.');
    await sheet.getByLabel(/Note/).fill('');
    await sheet.getByRole('button', { name: 'Add income' }).click();
    await expect(sheet).toBeHidden();
  });

  test('a double tap on Add adds one entry, not two', async ({ page }) => {
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Amount').fill('75');
    await sheet.getByRole('button', { name: 'Add income' }).dblclick();
    await expect(sheet).toBeHidden();
    expect((await storedData(page)).entries).toHaveLength(1);
  });
});

test.describe('history, edit and delete', () => {
  test.beforeEach(async ({ page }) => {
    await onboard(page);
    await addIncome(page, '100', { note: 'Logo' });
    await addIncome(page, '200', { note: 'Website' });
    await addIncome(page, '300', { note: 'Copy' });
    await goTo(page, 'History');
  });

  test('groups entries by day, newest first, with day totals', async ({ page }) => {
    await expect(page.getByText('3 entries · €600')).toBeVisible();
    const group = page.locator('.group', { hasText: 'Today' });
    await expect(group.locator('.group__head')).toContainText('€600');
    await expect(group.locator('.entry__note')).toHaveText(['Copy', 'Website', 'Logo']);
  });

  test('case 6 — delete asks first, then removes €200 from €600 → €400', async ({ page }) => {
    await page.getByRole('button', { name: /More actions for €200/ }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Delete this income?');
    await expect(dialog).toContainText('€200 will be removed from your monthly total.');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('3 entries · €600')).toBeVisible(); // cancel changes nothing

    await page.getByRole('button', { name: /More actions for €200/ }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('2 entries · €400')).toBeVisible();
    await goTo(page, 'Home');
    await expect(ring(page)).toContainText('€400');
    await page.reload();
    await expect(ring(page)).toContainText('€400'); // still deleted after a restart
  });

  test('case 7 — editing €100 to €500 takes €600 to €1,000, and survives a restart', async ({ page }) => {
    await page.locator('.entry__main', { hasText: 'Logo' }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit income' });
    await expect(sheet.getByLabel('Amount')).toHaveValue('100');
    await sheet.getByLabel('Amount').fill('500');
    await sheet.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('3 entries · €1,000')).toBeVisible();
    await goTo(page, 'Home');
    await expect(ring(page)).toContainText('€1,000');
    await page.reload();
    await expect(ring(page)).toContainText('€1,000');
  });

  test('moving an entry to another month updates both months', async ({ page }) => {
    await page.locator('.entry__main', { hasText: 'Logo' }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit income' });
    await sheet.getByLabel('Date').fill('2026-08-31');
    await sheet.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('2 entries · €500')).toBeVisible();
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByText('1 entry · €100')).toBeVisible();
  });

  test('the calendar shows income days and filters to one day', async ({ page }) => {
    await page.getByRole('button', { name: 'Show calendar' }).click();
    await page.getByRole('button', { name: /September 15, 2026, €600 earned/ }).click();
    await expect(page.getByText('Total for September 15: €600')).toBeVisible();
    await page.getByRole('button', { name: /September 14, 2026, no income/ }).click();
    await expect(page.getByText('No income on this day.')).toBeVisible();
    await page.getByRole('button', { name: /September 14, 2026/ }).click(); // toggle off
    await expect(page.locator('.entry')).toHaveCount(3);
  });

  test('an empty month has a friendly empty state', async ({ page }) => {
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByRole('heading', { name: 'No income yet' })).toBeVisible();
    await expect(page.getByText('Your first payment will appear here.')).toBeVisible();
  });
});

test.describe('months', () => {
  test('case 8 — every screen follows the selected month; future months invent nothing', async ({ page }) => {
    await seed(page, {
      goal: 3000,
      entries: [
        { date: '2026-08-10', amount: 2700, note: 'August project' },
        { date: '2026-09-03', amount: 500, note: 'Sept project' },
      ],
    });
    await page.goto('/');
    await expect(ring(page)).toContainText('€500');

    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByText('August 2026')).toBeVisible();
    await expect(ring(page)).toContainText('€2,700');
    await expect(ring(page)).toContainText('90% of goal');
    await expect(hero(page)).toContainText('€300 to goal'); // past month: factual, not "left"
    await expect(stat(page, 'To reach your goal')).toHaveCount(0);
    await expect(stat(page, 'Daily average')).toContainText('€87'); // 2700 / 31 days
    await goTo(page, 'History');
    await expect(page.locator('.entry__note')).toHaveText(['August project']);
    await goTo(page, 'Insights');
    await expect(page.getByText('Income · August 2026')).toBeVisible();

    await goTo(page, 'Home');
    await page.getByRole('button', { name: 'Back to this month' }).click();
    await expect(ring(page)).toContainText('€500');

    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByText('October 2026')).toBeVisible();
    await expect(hero(page)).toContainText('No income yet');
    await expect(ring(page)).toContainText('€0');
    await expect(stat(page, 'Daily average')).toHaveCount(0);
    await expect(page.locator('.chart')).toHaveCount(0);
  });

  test('a future month without a goal invites you to set one; goals never change past months', async ({ page }) => {
    await seed(page, { goal: 3000, entries: [{ date: '2026-09-03', amount: 500 }] });
    await page.goto('/');
    await page.getByRole('button', { name: 'Next month' }).click();
    await hero(page).getByRole('button', { name: /Monthly goal: €3,000/ }).click(); // inherited, editable
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Monthly goal amount').fill('4000');
    await sheet.getByRole('button', { name: 'Save goal' }).click();
    await expect(hero(page)).toContainText('Monthly goal: €4,000');
    await page.getByRole('button', { name: 'Previous month' }).click(); // September untouched
    await expect(hero(page)).toContainText('Monthly goal: €3,000');
    await page.getByRole('button', { name: 'Next month' }).click();
    await page.getByRole('button', { name: 'Next month' }).click(); // November inherits October
    await expect(hero(page)).toContainText('Monthly goal: €4,000');
  });

  test('adding income while viewing another month files it in that month', async ({ page }) => {
    await seed(page, { goal: 3000, entries: [] });
    await page.goto('/');
    await page.getByRole('button', { name: 'Previous month' }).click();
    await addIncome(page, '800');
    await expect(ring(page)).toContainText('€800');
    expect((await storedData(page)).entries[0].date).toBe('2026-08-31');
  });
});

test.describe('insights', () => {
  test('empty until there is data, then compares with last month', async ({ page }) => {
    await seed(page, { entries: [] });
    await page.goto('/');
    await goTo(page, 'Insights');
    await expect(page.getByRole('heading', { name: 'Not enough data yet' })).toBeVisible();
    await expect(page.getByText('Add a few income entries to see your insights.')).toBeVisible();
  });

  test('previous-month comparison: difference, percentage, and no percentage without a base', async ({ page }) => {
    await seed(page, {
      entries: [
        { date: '2026-08-05', amount: 2500 },
        { date: '2026-09-05', amount: 3000 },
        { date: '2026-09-06', amount: 720 },
      ],
    });
    await page.goto('/');
    await goTo(page, 'Insights');
    await expect(page.locator('.compare')).toContainText('+€1,220');
    await expect(page.locator('.compare')).toContainText('+48.8%');
    await expect(stat(page, 'Your best day')).toContainText('€3,000');
    await expect(stat(page, 'Days with income')).toContainText('2 / 15');
    await expect(stat(page, 'Income streak')).toHaveCount(0); // nothing yesterday/today

    await page.getByRole('button', { name: 'Previous month' }).click(); // August: July has no income
    await expect(page.getByText('No previous income data')).toBeVisible();
    await expect(page.locator('.compare')).not.toContainText('%');
  });
});

test.describe('persistence and settings', () => {
  test('case 9 — everything survives a restart', async ({ page }) => {
    await onboard(page, { goal: '5000', currency: 'Euro' });
    await addIncome(page, '500', { note: 'Persisted' });
    await page.reload();
    await expect(ring(page)).toContainText('€500');
    await expect(hero(page)).toContainText('Monthly goal: €5,000');
    await goTo(page, 'History');
    await expect(page.getByText('Persisted')).toBeVisible();
  });

  test('case 10 — theme switching changes the whole app and is remembered', async ({ page }) => {
    await seed(page, { entries: [{ date: '2026-09-03', amount: 500 }], theme: 'light' });
    await page.goto('/');
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const lightBg = await background();
    await goTo(page, 'Settings');
    await page.getByText('Dark', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await background()).not.toBe(lightBg);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); // no flash back to light
    await goTo(page, 'Settings');
    await page.getByText('System', { exact: true }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  });

  test('"System" follows the OS appearance', async ({ page }) => {
    await seed(page, { theme: 'system' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(14, 15, 18)');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(245, 245, 242)');
  });

  test('changing currency explains itself, converts nothing, and keeps the numbers', async ({ page }) => {
    await seed(page, { entries: [{ date: '2026-09-03', amount: 1234.5 }], currency: 'EUR' });
    await page.goto('/');
    await expect(ring(page)).toContainText('€1,234.50');
    await goTo(page, 'Settings');
    await page.getByRole('button', { name: /Currency/ }).click();
    await page.getByText('US Dollar', { exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Nothing is converted.');
    await dialog.getByRole('button', { name: 'Change currency' }).click();
    await goTo(page, 'Home');
    await expect(ring(page)).toContainText('$1,234.50');
    expect((await storedData(page)).entries[0]).toMatchObject({ amount: 123450, currency: 'USD' });
  });

  test('the Settings goal applies from this month on and leaves earlier months alone', async ({ page }) => {
    await seed(page, { goal: 3000, entries: [{ date: '2026-08-10', amount: 1500 }] });
    await page.goto('/');
    await goTo(page, 'Settings');
    await page.getByRole('button', { name: /Monthly goal/ }).click();
    await page.getByRole('dialog').getByLabel('Monthly goal amount').fill('4000');
    await page.getByRole('dialog').getByRole('button', { name: 'Save goal' }).click();
    await goTo(page, 'Home');
    await expect(hero(page)).toContainText('Monthly goal: €4,000');
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(hero(page)).toContainText('Monthly goal: €3,000');
    await expect(ring(page)).toContainText('50% of goal');
  });

  test('delete all data asks first, then returns to a clean first launch', async ({ page }) => {
    await seed(page, { entries: [{ date: '2026-09-03', amount: 500 }] });
    await page.goto('/');
    await goTo(page, 'Settings');
    await page.getByRole('button', { name: /Delete all data/ }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Delete all data?');
    await expect(dialog).toContainText('This will permanently delete your income history and settings.');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect((await storedData(page)).entries).toHaveLength(1);

    await page.getByRole('button', { name: /Delete all data/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete all' }).click();
    const question = page.getByRole('heading', { name: 'What language would you like to use in the app?' });
    await expect(question).toBeVisible();
    await page.reload();
    await expect(question).toBeVisible(); // nothing came back
  });
});

test.describe('CSV export and import', () => {
  test('exports a spreadsheet-friendly file, and re-importing it adds nothing twice', async ({ page }) => {
    await seed(page, {
      entries: [
        { date: '2026-09-01', amount: 150, note: 'Website' },
        { date: '2026-09-03', amount: 300, note: 'Logo, "final"' },
        { date: '2026-09-04', amount: 20.5 },
      ],
    });
    await page.goto('/');
    await goTo(page, 'Settings');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export data/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('freelanche-income-2026-09-15.csv');
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const csv = readFileSync(path, 'utf8');
    expect(csv).toBe(
      '\uFEFFDate,Amount,Currency,Note\r\n2026-09-01,150,EUR,Website\r\n2026-09-03,300,EUR,"Logo, ""final"""\r\n2026-09-04,20.50,EUR,\r\n',
    );

    // Importing the same file: nothing new, nothing overwritten.
    await page.locator('input[type=file]').setInputFiles({ name: 'export.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByRole('status')).toContainText('nothing new to import');
    expect((await storedData(page)).entries).toHaveLength(3);
  });

  test('imports new rows after showing what will happen', async ({ page }) => {
    await seed(page, { entries: [{ date: '2026-09-01', amount: 150, note: 'Website' }] });
    await page.goto('/');
    await goTo(page, 'Settings');
    const csv = [
      'Date,Amount,Currency,Note',
      '2026-09-01,150,EUR,Website', // already there
      '2026-09-07,400,EUR,New job',
      '2026-09-08,90,EUR,',
      'not-a-date,5,EUR,oops',
      '2026-09-09,50,USD,wrong currency',
    ].join('\n');
    await page.locator('input[type=file]').setInputFiles({ name: 'in.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('2 new entries');
    await expect(dialog).toContainText('1 entry is already in your history');
    await expect(dialog).toContainText('1 row could not be read');
    await expect(dialog).toContainText('1 row is in another currency');
    await dialog.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('status')).toContainText('Imported 2 entries');
    expect((await storedData(page)).entries).toHaveLength(3);
  });

  test('rejects a file that is not an income export', async ({ page }) => {
    await seed(page, {});
    await page.goto('/');
    await goTo(page, 'Settings');
    await page.locator('input[type=file]').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('foo,bar\n1,2\n') });
    await expect(page.getByRole('status')).toContainText("doesn't look like an income file");
  });
});

test.describe('dates and time zones', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('late on the 30th stays the 30th even though UTC has already reached October', async ({ page }) => {
    // 23:30 in Los Angeles on 30 Sep is 06:30 UTC on 1 Oct.
    await page.clock.setFixedTime(new Date('2026-10-01T06:30:00Z'));
    await seed(page, { goal: 3000, entries: [] });
    await page.goto('/');
    await expect(page.getByText('September 2026')).toBeVisible();
    await addIncome(page, '100');
    const data = await storedData(page);
    expect(data.entries[0].date).toBe('2026-09-30');
    expect(data.entries[0].createdAt).toBe('2026-10-01T06:30:00.000Z');
    await expect(stat(page, 'Today')).toContainText('€100');
  });
});

test.describe('language', () => {
  test('switching to Russian in Settings translates the app and formats numbers the Russian way', async ({ page }) => {
    await seed(page, { entries: [{ date: '2026-09-03', amount: 1500.5 }], goal: 3000, name: 'Алекс' });
    await page.goto('/');
    await goTo(page, 'Settings');
    await page.getByRole('button', { name: /Language/ }).click();
    await page.locator('label.language', { hasText: 'Русский' }).click();
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
    await page.getByRole('link', { name: 'Главная' }).click();
    await expect(page.getByText('Заработано в этом месяце')).toBeVisible();
    await expect(page.getByText('Сентябрь 2026')).toBeVisible();
    await expect(ring(page)).toContainText(/1\s500,50\s€/);
    await expect(page.getByRole('button', { name: 'Добавить доход' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Добавить доход' })).toBeVisible(); // remembered
  });
});

test.describe('keyboard and accessibility', () => {
  test('the add-income sheet is fully keyboard operable and returns focus', async ({ page }) => {
    await seed(page, { entries: [] });
    await page.goto('/');
    const add = page.getByRole('button', { name: 'Add income' });
    await add.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByLabel('Amount')).toBeFocused(); // numeric keyboard opens on mobile
    await page.keyboard.type('42');
    await page.keyboard.press('Enter'); // submits from the amount field
    await expect(sheet).toBeHidden();
    await expect(ring(page)).toContainText('€42');
    await expect(add).toBeFocused();

    await add.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(add).toBeFocused();
  });

  test('focus is trapped inside an open sheet, and the page behind is inert', async ({ page }) => {
    await seed(page, { entries: [] });
    await page.goto('/');
    await page.getByRole('button', { name: 'Add income' }).click();
    const sheet = page.getByRole('dialog');
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab');
      expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    expect(await page.evaluate(() => document.getElementById('root')?.hasAttribute('inert'))).toBe(true);
  });

  test('touch targets are at least 44 px', async ({ page }) => {
    await seed(page, { entries: [{ date: '2026-09-03', amount: 500 }] });
    await page.goto('/');
    for (const tab of ['Home', 'History', 'Insights', 'Settings'] as const) {
      await goTo(page, tab);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('button, a[href], input:not(.sr-only):not(.date-field__input), [role=slider]')]
          .filter((el) => el.offsetParent !== null && !el.classList.contains('sr-only'))
          .map((el) => ({ label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.height < 43.5 || r.width < 43.5))
          .map(({ label, r }) => `${label} ${Math.round(r.width)}x${Math.round(r.height)}`),
      );
      expect(small, `${tab} has small targets`).toEqual([]);
    }
  });

  test('reduced motion: goal celebration and counting animations are skipped, values still correct', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await onboard(page, { goal: '100', currency: 'Euro' });
    await addIncome(page, '100');
    await expect(hero(page)).toContainText('Goal reached!');
    await expect(page.locator('.ring--pulse')).toHaveCount(0);
  });
});

test.describe('offline', () => {
  test('after the first visit the app opens and works with no network at all', async ({ page, context }) => {
    await onboard(page, { goal: '3000', currency: 'Euro' });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload(); // now controlled by the service worker
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Add income' })).toBeVisible();
    await addIncome(page, '600', { note: 'Offline job' });
    await expect(ring(page)).toContainText('€600');
    await goTo(page, 'History');
    await expect(page.getByText('Offline job')).toBeVisible();
    await goTo(page, 'Insights');
    await expect(page.getByText('Income this month')).toBeVisible();
    await context.setOffline(false);
  });

  test('every language is available offline: all 12 can be switched to with no network', async ({ page, context }) => {
    test.setTimeout(90_000);
    await onboard(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    let current = 'en';
    for (const language of LANGUAGES) {
      if (language.code === current) continue;
      await goTo(page, 'Settings', current);
      await page.getByRole('button', { name: new RegExp(`^${dict(current)['settings.language']}`) }).click();
      await page.locator('label.language', { hasText: language.nativeName }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${language.code}(-|$)`));
      await expect(page.getByRole('navigation', { name: dict(language.code)['nav.label'] })).toBeVisible();
      current = language.code;
    }
    await context.setOffline(false);
  });

  test('the app never makes a network request to anyone else', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol.startsWith('http')) external.push(request.url());
    });
    await onboard(page);
    await addIncome(page, '100');
    await goTo(page, 'Settings');
    expect(external).toEqual([]);
  });
});

test.describe('health', () => {
  test('the full journey runs with a clean console: no errors, warnings or CSP violations', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) problems.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

    await onboard(page);
    await addIncome(page, '1200.50', { note: 'Health check' });
    for (const tab of ['History', 'Insights', 'Settings', 'Home'] as const) await goTo(page, tab);
    await page.getByRole('button', { name: 'Previous month' }).click();
    await page.getByRole('button', { name: 'Next month' }).click();
    await page.reload();
    await expect(ring(page)).toContainText('€1,200.50');
    expect(problems).toEqual([]);
  });
});

test.describe('damaged data', () => {
  test('unreadable saved data shows a calm recovery screen and keeps a backup', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('freelanche:data', '{"entries": [oops'));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: "We couldn't read your saved data" })).toBeVisible();
    // Nothing was overwritten while the choice is pending.
    expect(await page.evaluate(() => window.localStorage.getItem('freelanche:data'))).toBe('{"entries": [oops');
    expect(await page.evaluate(() => window.localStorage.getItem('freelanche:data:unreadable-backup'))).toBe('{"entries": [oops');
    await page.getByRole('button', { name: 'Start fresh' }).click();
    await expect(page.getByRole('heading', { name: 'What language would you like to use in the app?' })).toBeVisible();
  });

  test('a few bad records are dropped without taking the app down', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'freelanche-mock:billing',
        JSON.stringify({ purchases: [{ productId: 'freelanche_premium', purchaseToken: 't', purchaseTimeMs: 1, state: 'purchased', autoRenewing: true, acknowledged: true }], trialUsed: true }),
      );
      window.localStorage.setItem(
        'freelanche:data',
        JSON.stringify({
          schemaVersion: 1,
          settings: { currency: 'EUR', defaultMonthlyGoal: 300000, theme: 'light', onboardingCompleted: true, language: 'en' },
          entries: [
            { id: 'ok', amount: 10000, currency: 'EUR', date: '2026-09-03', createdAt: '2026-09-03T10:00:00.000Z', updatedAt: '2026-09-03T10:00:00.000Z' },
            { id: 'bad', amount: 'lots', date: '2026-09-03' },
            { id: 'bad2', amount: 500, date: 'yesterday' },
          ],
          goals: [],
        }),
      );
    });
    await page.goto('/');
    await expect(ring(page)).toContainText('€100');
  });
});
