import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createLocalPersistence, getBrowserStorage } from './data/persistence';
import { suggestCurrency } from './format/currencies';
import { detectLanguage, deviceLocales } from './format/locale';
import { I18nProvider } from './i18n/I18nProvider';
import { createId } from './lib/id';
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
  defaults: { language: detectLanguage(locales), currency: suggestCurrency(locales) },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider store={store}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StoreProvider>
  </StrictMode>,
);

// The first paint is React's; drop the static boot screen.
document.getElementById('boot')?.remove();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline caching is a bonus; the app works without it */
    });
  });
}
