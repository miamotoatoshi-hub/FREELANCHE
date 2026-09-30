import { useEffect } from 'react';
import { THEME_KEY } from '../../data/persistence';
import { useAppSelector, useAppStore } from '../../state/context';

/** Keeps "today" correct across midnight, sleep and time-zone changes. */
export function useTodaySync(): void {
  const store = useAppStore();
  useEffect(() => {
    const sync = () => store.syncToday();
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', sync);
    window.addEventListener('pageshow', sync);
    const timer = window.setInterval(sync, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', sync);
      window.removeEventListener('pageshow', sync);
      window.clearInterval(timer);
    };
  }, [store]);
}

/** Applies the theme preference to the document, follows the OS when set to "system". */
export function useTheme(): void {
  const theme = useAppSelector((s) => s.data.settings.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable — the OS preference still applies */
    }

    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const paint = () => {
      const dark = theme === 'dark' || (theme === 'system' && !!media?.matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e0f12' : '#f5f5f2');
    };
    paint();
    media?.addEventListener?.('change', paint);
    return () => media?.removeEventListener?.('change', paint);
  }, [theme]);
}

/** Picks up edits made in another tab. */
export function useCrossTabSync(): void {
  const store = useAppStore();
  useEffect(() => store.watchOtherTabs(), [store]);
}

/** A tiny tap of feedback on devices that support it. */
export function haptic(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
