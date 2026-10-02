import { useCallback } from 'react';
import { loadLocale } from '../../i18n/registry';
import { useAppStore } from '../../state/context';

/**
 * Switches the interface language. The new language's strings are fetched first,
 * so the whole UI changes in one step — never a flash of half-translated text.
 */
export function useChangeLanguage(): (code: string) => Promise<void> {
  const store = useAppStore();
  return useCallback(
    async (code) => {
      await loadLocale(code);
      store.setLanguage(code);
    },
    [store],
  );
}
