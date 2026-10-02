import { expect, test, type Page } from '@playwright/test';
import { LANGUAGES, dict, freezeClock, goTo, seed, startTrial, visible } from './helpers';

/**
 * Layout and localisation across all 12 languages: nothing overflows or is clipped on a small phone, a
 * regular phone or a desktop window, right-to-left languages are mirrored properly, and the formats
 * (month names, digits, currency) are the ones the language's own conventions call for.
 */

const SIZES = [
  { name: 'small phone 320×568', width: 320, height: 568 },
  { name: 'phone 390×844', width: 390, height: 844 },
  { name: 'tablet 768×1024', width: 768, height: 1024 },
  { name: 'desktop 1280×800', width: 1280, height: 800 },
] as const;

/** One representative currency per language, so symbols and digit systems get stressed too. */
const CURRENCY: Record<string, string> = {
  en: 'USD',
  zh: 'CNY',
  hi: 'INR',
  es: 'EUR',
  fr: 'EUR',
  ar: 'AED',
  bn: 'BDT',
  pt: 'BRL',
  ru: 'RUB',
  ur: 'PKR',
  id: 'IDR',
  ja: 'JPY',
  de: 'EUR',
  ko: 'KRW',
};

const ENTRIES = [
  { date: '2026-09-01', amount: 1500, note: 'Website' },
  { date: '2026-09-03', amount: 300 },
  { date: '2026-09-05', amount: 720, note: 'A fairly long note about a brand identity project' },
  { date: '2026-09-12', amount: 250.5 },
  { date: '2026-09-15', amount: 200 },
  { date: '2026-08-10', amount: 2700, note: 'August project' },
];

async function open(page: Page, language: string, size: (typeof SIZES)[number], options: { onboarded?: boolean; subscription?: 'active' | 'cancelled' | 'none' } = {}) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await freezeClock(page);
  await seed(page, {
    language,
    name: 'Alexandra',
    currency: CURRENCY[language],
    entries: ENTRIES,
    goal: ['IDR', 'JPY', 'KRW'].includes(CURRENCY[language]!) ? 3_000_000 : 3000,
    ...options,
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${language}(-|$)`));
}

/**
 * Looks for the layout failures people actually notice: the page scrolling sideways, something poking out
 * of the screen, text clipped by its own box, and neighbours (the tab bar) sitting on top of each other.
 */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const viewport = document.documentElement.clientWidth;
    const root = document.documentElement;
    if (root.scrollWidth > viewport + 1) problems.push(`the page scrolls sideways (${root.scrollWidth}px > ${viewport}px)`);

    const describe = (el: Element) => {
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `<${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}> "${text}"`;
    };
    const isHidden = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return true;
      }
      return false;
    };
    const insideScroller = (el: Element) => {
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const { overflowX } = getComputedStyle(node);
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }
      return false;
    };

    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      if (el.closest('.sr-only, .visually-hidden') || isHidden(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);

      if (!insideScroller(el) && (rect.right > viewport + 1 || rect.left < -1)) {
        problems.push(`${describe(el)} sticks out of the screen (${Math.round(rect.left)}→${Math.round(rect.right)} of ${viewport})`);
      }

      const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim());
      const clips = style.overflowX === 'hidden' || style.overflowX === 'clip';
      if (hasOwnText && clips && el.scrollWidth > el.clientWidth + 1 && !el.matches('.entry__note')) {
        problems.push(`${describe(el)} is cut off (${el.scrollWidth}px of text in ${el.clientWidth}px)`);
      }
      if (hasOwnText && !clips && style.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 1) {
        problems.push(`${describe(el)} overflows its box (${el.scrollWidth}px of text in ${el.clientWidth}px)`);
      }
    }

    const tabs = Array.from(document.querySelectorAll<HTMLElement>('.tabbar__item')).map((el) => el.getBoundingClientRect());
    for (let i = 1; i < tabs.length; i++) {
      const a = tabs[i - 1]!;
      const b = tabs[i]!;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1) problems.push('tab bar items overlap');
    }
    for (const label of document.querySelectorAll<HTMLElement>('.tabbar__item span')) {
      const item = label.closest('.tabbar__item')!.getBoundingClientRect();
      const box = label.getBoundingClientRect();
      if (box.left < item.left - 1 || box.right > item.right + 1) problems.push(`tab label ${describe(label)} is wider than its tab`);
    }
    return problems;
  });
}

for (const size of SIZES) {
  test.describe(`layout — ${size.name}`, () => {
    for (const language of LANGUAGES) {
      test(`${language.nativeName}: every screen fits without overflow or clipped text`, async ({ page }) => {
        test.setTimeout(60_000);
        const d = dict(language.code);
        await open(page, language.code, size);
        const found: Record<string, string[]> = {};
        const check = async (label: string) => {
          await page.waitForTimeout(150);
          const problems = await layoutProblems(page);
          if (problems.length) found[label] = problems;
        };

        await check('home');
        for (const tab of ['History', 'Insights', 'Settings'] as const) {
          await goTo(page, tab, language.code);
          await check(tab.toLowerCase());
        }

        // the sheets people open most
        await goTo(page, 'Home', language.code);
        await page.getByRole('button', { name: d['home.add'] }).click();
        await page.getByRole('dialog').getByLabel(d['income.amount']!).fill('1234.56');
        await check('add-income sheet');
        await page.keyboard.press('Escape');

        await goTo(page, 'Settings', language.code);
        for (const [key, label] of [
          ['settings.name', 'name sheet'],
          ['settings.language', 'language sheet'],
          ['settings.currency', 'currency sheet'],
          ['settings.goal', 'goal sheet'],
        ] as const) {
          await page.getByRole('button', { name: new RegExp(`^${d[key]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await check(label);
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog')).toBeHidden();
        }

        expect(found, `layout problems in ${language.englishName} at ${size.name}`).toEqual({});
      });
    }

    for (const language of LANGUAGES) {
      test(`${language.nativeName}: the locked screen (no subscription) fits too`, async ({ page }) => {
        test.setTimeout(60_000);
        const d = dict(language.code);
        await open(page, language.code, size, { subscription: 'none' });
        await expect(page.getByRole('button', { name: d['paywall.cta.trial'] })).toBeVisible();
        await page.waitForTimeout(150);
        expect(await layoutProblems(page), `paywall layout in ${language.englishName} at ${size.name}`).toEqual([]);
        // the small print is shown in full, not cut off
        await expect(page.locator('.paywall__terms')).toBeVisible();
      });
    }

    test(`onboarding fits in every language`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const language of LANGUAGES) {
        await page.goto('/');
        await page.evaluate(() => window.localStorage.clear());
        await page.reload();
        const d = dict(language.code);
        const found: string[] = [];
        const check = async (step: string) => {
          await page.waitForTimeout(120);
          for (const problem of await layoutProblems(page)) found.push(`${step}: ${problem}`);
        };

        await page.locator('label.language', { hasText: language.nativeName }).click();
        await check('language');
        await page.getByRole('button', { name: d['common.continue'] }).click();
        await page.getByLabel(d['name.label']!).fill('Alexandra');
        await check('name');
        await page.getByRole('button', { name: d['common.continue'] }).click();
        await expect(page.getByRole('button', { name: d['paywall.cta.trial'] })).toBeVisible();
        await check('free trial');
        await startTrial(page, language.code);
        await page.getByRole('searchbox', { name: d['currency.search'] }).fill(CURRENCY[language.code]!);
        await check('currency');
        await page.locator('label.currency').first().click();
        await page.getByRole('button', { name: d['common.continue'] }).click();
        await page.getByLabel(d['goal.amountLabel']!).fill('2000000');
        await check('goal');
        expect(found, `onboarding layout in ${language.englishName} at ${size.name}`).toEqual([]);
      }
    });
  });
}

test.describe('right-to-left (Arabic and Urdu)', () => {
  for (const code of ['ar', 'ur']) {
    test(`${code}: direction, navigation, month selector, forms and alignment are mirrored`, async ({ page }) => {
      const d = dict(code);
      await open(page, code, SIZES[1]);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

      // navigation: the first tab (Home) is at the right edge
      const tabs = page.locator('.tabbar__item');
      const first = await tabs.first().boundingBox();
      const last = await tabs.last().boundingBox();
      expect(first!.x).toBeGreaterThan(last!.x);

      // month selector: "previous" on the right, pointing right; "next" on the left, pointing left
      const prev = page.getByRole('button', { name: d['month.previous'] });
      const next = page.getByRole('button', { name: d['month.next'] });
      expect((await prev.boundingBox())!.x).toBeGreaterThan((await next.boundingBox())!.x);
      expect(await prev.locator('svg').evaluate((el) => getComputedStyle(el).transform)).toMatch(/^matrix\(-1,/);
      expect(await next.locator('svg').evaluate((el) => getComputedStyle(el).transform)).toMatch(/^matrix\(-1,/);

      // text starts at the right edge
      const greeting = page.locator('h1.greeting');
      await expect(greeting).toHaveCSS('direction', 'rtl');
      const heading = (await greeting.boundingBox())!;
      const gutter = 390 - (heading.x + heading.width);
      expect(gutter).toBeLessThan(40);
      expect(heading.x).toBeLessThan(40 + 80);

      // the chart keeps time flowing left to right, as numbers and axes do everywhere
      await expect(page.locator('.chart__frame')).toHaveCSS('direction', 'ltr');

      // settings rows: the label at the start (right), the value at the end (left)
      await goTo(page, 'Settings', code);
      const row = page.getByRole('button', { name: new RegExp(`^${d['settings.name']}`) }).first();
      const label = await row.locator('.row__label, .row__title, span').first().boundingBox();
      const value = await row.locator('.row__value').first().boundingBox();
      expect(label!.x).toBeGreaterThan(value!.x);

      // forms: amount stays a left-to-right number field, but its label and button follow the language
      await goTo(page, 'Home', code);
      await page.getByRole('button', { name: d['home.add'] }).click();
      const sheet = page.getByRole('dialog');
      const amount = sheet.getByLabel(d['income.amount']!);
      await expect(amount).toHaveCSS('direction', 'ltr');
      await expect(sheet).toHaveCSS('direction', 'rtl');
      await amount.fill('1234.5');
      expect(visible(await amount.inputValue())).toMatch(/^1[,٬]234[.٫]5$/); // grouped live, whichever marks the locale uses
    });

    test(`${code}: the paywall is mirrored — text and ticks start on the right, the offer stays centred`, async ({ page }) => {
      const d = dict(code);
      await open(page, code, SIZES[1], { subscription: 'none' });
      await expect(page.getByRole('button', { name: d['paywall.cta.trial'] })).toBeVisible();
      await expect(page.locator('.paywall__features')).toHaveCSS('direction', 'rtl');
      const first = page.locator('.paywall__features li').first();
      const tick = (await first.locator('svg').boundingBox())!;
      const words = (await first.locator('span').boundingBox())!;
      expect(tick.x).toBeGreaterThan(words.x); // the tick sits at the start = right
      const heading = (await page.locator('h1').boundingBox())!;
      expect(390 - (heading.x + heading.width)).toBeLessThan(60); // title hugs the right edge
      const offer = (await page.locator('.paywall__offer').boundingBox())!;
      expect(Math.abs(offer.x + offer.width / 2 - 195)).toBeLessThan(2); // card is centred on the screen
      const cta = (await page.getByRole('button', { name: d['paywall.cta.trial'] }).boundingBox())!;
      expect(cta.width).toBeGreaterThan(300); // full-width button
    });

    test(`${code}: the first screen is already right-to-left on a cold start, with no flash of left-to-right`, async ({ page }) => {
      await open(page, code, SIZES[1]);
      // theme-init.js has applied direction before React ran
      const early = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang }));
      expect(early.dir).toBe('rtl');
      expect(early.lang).toMatch(new RegExp(`^${code}(-|$)`));
    });
  }
});

test.describe('typography', () => {
  for (const code of ['ar', 'ur', 'hi', 'bn', 'zh', 'ja', 'ko']) {
    test(`${code}: connected and case-less scripts get no letter-spacing or forced capitals`, async ({ page }) => {
      await open(page, code, SIZES[1]);
      const offenders = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          if (el.closest('.amount, .amount-field__row')) continue;
          if ((el.textContent ?? '').trim() === '') continue;
          const style = getComputedStyle(el);
          if (style.letterSpacing !== 'normal' && style.letterSpacing !== '0px') bad.push(`${el.className}: letter-spacing ${style.letterSpacing}`);
          if (style.textTransform === 'uppercase') bad.push(`${el.className}: uppercase`);
        }
        return bad;
      });
      expect(offenders).toEqual([]);
    });
  }

  const STACKS: Record<string, RegExp> = {
    zh: /Noto Sans (CJK )?SC|PingFang SC|Microsoft YaHei/,
    ja: /Noto Sans (CJK )?JP|Hiragino|Yu Gothic|Meiryo/,
    ko: /Noto Sans (CJK )?KR|Malgun|Apple SD Gothic/,
    hi: /Devanagari/,
    bn: /Bangla|Bengali/,
    ar: /Arabic|Geeza|Tahoma|Segoe UI/,
    ur: /Nastaliq|Arabic|Geeza|Tahoma|Segoe UI/,
  };
  for (const [code, pattern] of Object.entries(STACKS)) {
    test(`${code}: gets its own font stack${['hi', 'bn', 'ar', 'ur'].includes(code) ? ' and a taller line height' : ''}`, async ({ page }) => {
      await open(page, code, SIZES[1]);
      const { family, lineHeight, fontSize } = await page.evaluate(() => {
        const style = getComputedStyle(document.querySelector('h1')!);
        return { family: style.fontFamily, lineHeight: parseFloat(style.lineHeight), fontSize: parseFloat(style.fontSize) };
      });
      expect(family).toMatch(pattern);
      if (['hi', 'bn', 'ar', 'ur'].includes(code)) expect(lineHeight / fontSize).toBeGreaterThanOrEqual(1.4);
    });
  }
});

test.describe('regional formats', () => {
  for (const language of LANGUAGES) {
    test(`${language.nativeName}: the month and currency follow the language's own conventions`, async ({ page }) => {
      await open(page, language.code, SIZES[1]);
      const currency = CURRENCY[language.code]!;

      const month = new Intl.DateTimeFormat(language.defaultLocale, { month: 'long', year: 'numeric', calendar: 'gregory' }).format(new Date(2026, 8, 15));
      // Intl appends the Russian year marker "г."; the app deliberately shows the plain "сентябрь 2026"
      expect(visible(await page.locator('.month__name').textContent()).toLowerCase()).toBe(month.replace(/\s*г\.$/, '').toLowerCase());

      // the goal line is the goal, formatted by Intl for this locale and currency
      const goal = ['IDR', 'JPY', 'KRW'].includes(currency) ? 3_000_000 : 3000;
      const expected = new Intl.NumberFormat(language.defaultLocale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(goal);
      const normalise = (text: string) => visible(text).replace(/[\s\u00a0\u202f\u200e\u200f\u061c]+/g, '');
      expect(normalise((await page.locator('.hero').textContent()) ?? '')).toContain(normalise(expected));
    });
  }
});
