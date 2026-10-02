import { test } from '@playwright/test';
import { freezeClock, seed } from './helpers';

// TEMPORARY diagnostics for the offline failures seen only on GitHub's (newer) Chromium. Deleted once understood.
test.skip(!process.env.DEBUG_OFFLINE, 'diagnostic run only');

test('offline diagnostics', async ({ page, context, browserName }) => {
  const log: string[] = [`browser ${browserName} ${context.browser()?.version()}`];
  page.on('console', (m) => log.push(`console.${m.type()}: ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('requestfailed', (r) => log.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => log.push(`response ${r.status()} ${r.url()} fromSW=${r.fromServiceWorker()}`));
  context.on('serviceworker', (w) => log.push(`serviceworker event: ${w.url()}`));

  await freezeClock(page);
  await seed(page, { subscription: 'active' });
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  const info = () =>
    page.evaluate(async () => {
      const keys = await caches.keys();
      const cached = await Promise.all(keys.map(async (k) => (await (await caches.open(k)).keys()).map((r) => r.url.replace(location.origin, ''))));
      const reg = await navigator.serviceWorker.getRegistration();
      return { controller: !!navigator.serviceWorker.controller, active: reg?.active?.state, keys, cached };
    });
  log.push('A after first load ' + JSON.stringify(await info()));
  await page.reload();
  await page.waitForTimeout(500);
  log.push('B after online reload ' + JSON.stringify(await info()));

  await context.setOffline(true);
  log.push('--- offline: reload');
  const resp = await page.reload({ timeout: 15000 }).catch((e) => {
    log.push('reload threw: ' + String(e.message).slice(0, 300));
    return null;
  });
  log.push(`reload status=${resp?.status()} fromSW=${resp?.fromServiceWorker()} url=${page.url()}`);
  await page.waitForTimeout(1500);
  log.push('title: ' + (await page.title().catch(() => '?')));
  log.push('body: ' + ((await page.locator('body').innerText().catch(() => '?')) as string).replace(/\s+/g, ' ').slice(0, 300));

  log.push('--- offline: goto');
  const resp2 = await page.goto('/', { timeout: 15000 }).catch((e) => {
    log.push('goto threw: ' + String(e.message).slice(0, 300));
    return null;
  });
  log.push(`goto status=${resp2?.status()} fromSW=${resp2?.fromServiceWorker()}`);
  await page.waitForTimeout(1500);
  log.push('body2: ' + ((await page.locator('body').innerText().catch(() => '?')) as string).replace(/\s+/g, ' ').slice(0, 300));

  // eslint-disable-next-line no-console
  console.log('\n===== OFFLINE DIAGNOSTICS =====\n' + log.join('\n') + '\n===== END =====');
});
