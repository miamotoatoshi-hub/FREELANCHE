// Renders the PNG app icons (web + Android) from the logo geometry. Run with `npm run icons`.
// Uses the browser Playwright already has (no extra image dependency).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

/** Android launcher icons. Adaptive icons draw the mark on a 108dp canvas whose outer third may be masked away. */
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const androidTargets = Object.entries(DENSITIES).flatMap(([density, scale]) => [
  // Foreground layer: the mark alone, transparent, inside the 66% safe zone.
  { file: `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, size: Math.round(108 * scale), mode: 'foreground' },
  // Legacy (pre-Android 8) icons.
  { file: `android/app/src/main/res/mipmap-${density}/ic_launcher.png`, size: Math.round(48 * scale), mode: 'rounded' },
  { file: `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, size: Math.round(48 * scale), mode: 'circle' },
]);

function androidSvg(size, mode) {
  if (mode === 'foreground') {
    // The mark occupies the middle ~56% of the canvas, comfortably inside the 66% safe zone.
    const scale = 0.56;
    const offset = 48 * (1 - scale);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96"><g transform="translate(${offset} ${offset}) scale(${scale})">${MARK}</g></svg>`;
  }
  const shape = mode === 'circle' ? '<circle cx="48" cy="48" r="48"' : '<rect width="96" height="96" rx="22"';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">${shape} fill="${ACCENT}"/><g transform="translate(9.6 9.6) scale(0.8)">${MARK}</g></svg>`;
}

mkdirSync('public/icons', { recursive: true });
const sandbox = '/opt/pw-browsers/chromium';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(sandbox) ? sandbox : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
for (const { file, size, rounded, pad } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg(size, { rounded, pad })}`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(`public/icons/${file}`, png);
  console.warn(`wrote public/icons/${file}`);
}
for (const { file, size, mode } of androidTargets) {
  if (!existsSync('android')) break; // the Android project is optional
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${androidSvg(size, mode)}`);
  writeFileSync(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  console.warn(`wrote ${file}`);
}
await browser.close();
