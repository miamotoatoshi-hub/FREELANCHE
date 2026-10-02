/**
 * Guards the one thing that must never ship: a build in which the subscription check can be bypassed.
 * Run after `npm run build` (the real, "play" build):
 *
 *   npm run verify:release
 *
 * It fails if the pretend Google Play (used by development and the browser tests) is anywhere in the
 * bundle, if the real Google Play bridge is missing, or if the privacy policy of the page loosened.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const assets = join(dist, 'assets');
const scripts = readdirSync(assets).filter((name) => name.endsWith('.js'));
const bundle = scripts.map((name) => readFileSync(join(assets, name), 'utf8')).join('\n');
// The meta tag is emitted with HTML-escaped quotes (&#39;); compare the decoded policy.
const html = readFileSync(join(dist, 'index.html'), 'utf8').replaceAll('&#39;', "'");

const problems = [];

for (const marker of ['freelanche-mock', 'mock-offer', 'freelanche-mock:changed']) {
  if (bundle.includes(marker)) problems.push(`the pretend Google Play ("${marker}") is in the production bundle — this build could be unlocked for free`);
}
if (!bundle.includes('FreelancheBilling')) problems.push('the Google Play Billing bridge ("FreelancheBilling") is missing from the bundle');
if (!bundle.includes('freelanche_premium')) problems.push('the subscription product id is missing from the bundle');
if (!/connect-src 'self'/.test(html)) problems.push("the Content-Security-Policy no longer restricts connect-src to 'self'");
if (!/object-src 'none'/.test(html)) problems.push("the Content-Security-Policy no longer blocks plugins (object-src 'none')");
if (/<script[^>]+src="https?:\/\//.test(html)) problems.push('the page loads a script from another origin');

if (problems.length > 0) {
  console.error('Release build check FAILED:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`Release build check passed (${scripts.length} scripts, no test billing, Play bridge present, CSP intact).`);
