import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n/I18nProvider';
import type { MessageKey } from './i18n';
import { useAppSelector } from './state/context';
import { BottomNav } from './ui/components/BottomNav';
import { useCrossTabSync, useTheme, useTodaySync } from './ui/hooks/useAppLifecycle';
import { useHashRoute, type Route } from './ui/hooks/useHashRoute';
import { HistoryScreen } from './ui/screens/HistoryScreen';
import { HomeScreen } from './ui/screens/HomeScreen';
import { InsightsScreen } from './ui/screens/InsightsScreen';
import { OnboardingScreen } from './ui/screens/OnboardingScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { SplashScreen } from './ui/screens/SplashScreen';
import { StorageErrorScreen } from './ui/screens/StorageErrorScreen';
import { UiProvider } from './ui/UiProvider';

const TITLES: Record<Route, MessageKey> = {
  home: 'nav.home',
  history: 'nav.history',
  insights: 'nav.insights',
  settings: 'nav.settings',
};

export function App() {
  const status = useAppSelector((s) => s.status);
  const onboarded = useAppSelector((s) => s.data.settings.onboardingCompleted);
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);

  useTheme();
  useTodaySync();
  useCrossTabSync();

  if (status === 'error') return <StorageErrorScreen />;
  if (!onboarded) {
    return (
      <div className="app app--flow">{splashDone ? <OnboardingScreen /> : <SplashScreen onDone={finishSplash} />}</div>
    );
  }
  return (
    <UiProvider>
      <Shell />
    </UiProvider>
  );
}

function Shell() {
  const { t } = useI18n();
  const [route] = useHashRoute();
  const mainRef = useRef<HTMLElement>(null);
  const firstRoute = useRef(true);

  useEffect(() => {
    document.title = `${t(TITLES[route])} · ${t('app.name')}`;
  }, [route, t]);

  // Moving between tabs moves focus to the new screen, so keyboard and screen-reader users land at its top.
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <div className="app">
      <main id="main" className="main" ref={mainRef} tabIndex={-1}>
        {route === 'home' && <HomeScreen />}
        {route === 'history' && <HistoryScreen />}
        {route === 'insights' && <InsightsScreen />}
        {route === 'settings' && <SettingsScreen />}
      </main>
      <BottomNav route={route} />
    </div>
  );
}
