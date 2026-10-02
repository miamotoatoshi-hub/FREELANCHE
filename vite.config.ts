import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Emits a tiny, dependency-free service worker that precaches the whole build,
 * so the app opens instantly and works with no network at all.
 */
function offlineServiceWorker(): Plugin {
  return {
    name: 'freelanche-offline-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle);
      const shell = [
        './',
        ...files,
        'manifest.webmanifest',
        'favicon.svg',
        'theme-init.js',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
        'icons/apple-touch-icon.png',
      ];
      const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 10);
      const source = `
const CACHE = 'freelanche-${version}';
const SHELL = ${JSON.stringify(shell)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request).catch(() =>
        request.mode === 'navigate' ? caches.match('./') : Response.error(),
      );
    }),
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/**
 * Production-only Content-Security-Policy. `connect-src 'self'` means the app
 * cannot talk to any other server even if a bug tried to — financial data stays put.
 * (Skipped in dev, where the Vite client needs inline scripts.)
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'freelanche-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  };
}

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Where subscription facts come from. Production builds always talk to Google Play; the pretend
 * Play used by `npm run dev`, the unit tests and the browser end-to-end tests is compiled away.
 *   vite build               → 'play'  (ship this)
 *   vite build --mode mock   → 'mock'  (end-to-end tests only; never ship)
 */
export default defineConfig(({ command, mode }) => ({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BILLING_MODE__: JSON.stringify(mode === 'mock' || command === 'serve' ? 'mock' : 'play'),
  },
  plugins: [react(), offlineServiceWorker(), contentSecurityPolicy()],
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
}));
