import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { EntitlementProvider } from './billing/context';
import { createEntitlementStore } from './billing';
import { createLocalPersistence, getBrowserStorage } from './data/persistence';
import { suggestCurrency } from './format/currencies';
import { detectLanguage, deviceLocales } from './format/locale';
import { I18nProvider } from './i18n/I18nProvider';
import { loadLocale } from './i18n/registry';
import { createId } from './lib/id';
import { Capacitor } from '@capacitor/core';
import { StoreProvider } from './state/context';
import { AppStore } from './state/store';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';

// Everything below happens on the device: storage, calculations, formatting. No network.
const locales = deviceLocales();
const store = new AppStore(createLocalPersistence(getBrowserStorage()), {
  now: () => new Date(),
  newId: createId,
  defaults: { language: detectLanguage(locales), currency: suggestCurrency(locales) ?? 'EUR' },
});

/** Longest we hold the first screen back for Google Play's first answer; after that the app shows its own "checking" screen. */
const FIRST_CHECK_WAIT_MS = 2500;

async function start() {
  const entitlements = await createEntitlementStore();
  // Fetch the saved language's strings first, so the very first paint is already in that language.
  await loadLocale(store.getSnapshot().data.settings.language);
  // Ask Google Play about the subscription at the same time, but never let a slow answer block the app for long.
  await Promise.race([entitlements.start(), new Promise<void>((resolve) => window.setTimeout(resolve, FIRST_CHECK_WAIT_MS))]);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <StoreProvider store={store}>
        <EntitlementProvider store={entitlements}>
          <I18nProvider>
            <App />
          </I18nProvider>
        </EntitlementProvider>
      </StoreProvider>
    </StrictMode>,
  );

  // The first paint is React's; drop the static boot screen.
  document.getElementById('boot')?.remove();
}

void start();

// The Android app ships its files inside the app itself; a service worker would only add a second, stale copy.
if ('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline caching is a bonus; the app works without it */
    });
  });
}
