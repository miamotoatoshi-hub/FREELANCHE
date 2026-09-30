// Renders the PNG app icons from the logo geometry. Run with `npm run icons`.
// Uses the browser Playwright already has (no extra image dependency).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const ACCENT = '#3b5bdb';
const MARK = `
  <path d="M22 66 40 48l12 11 22-25" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="74" cy="34" r="6.5" fill="#fff"/>`;

/** `pad` shrinks the mark toward the centre (for the maskable icon's safe zone). */
function svg(size, { rounded, pad = 0 }) {
  const scale = 1 - pad * 2;
  const offset = 48 * (1 - scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">
    <rect width="96" height="96" ${rounded ? 'rx="26"' : ''} fill="${ACCENT}"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})">${MARK}</g>
  </svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, rounded: true },
  { file: 'icon-512.png', size: 512, rounded: true },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, pad: 0.14 },
  // iOS applies its own rounding, so it gets a full-bleed square.
  { file: 'apple-touch-icon.png', size: 180, rounded: false, pad: 0.06 },
];

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
for (const { file, size, rounded, pad } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg(size, { rounded, pad })}`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(`public/icons/${file}`, png);
  console.warn(`wrote public/icons/${file}`);
}
await browser.close();
