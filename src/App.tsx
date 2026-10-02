import { useCallback, useEffect, useRef, useState } from 'react';
import { useEntitlement } from './billing/context';
import { useI18n } from './i18n/I18nProvider';
import type { MessageKey } from './i18n';
import { useAppSelector } from './state/context';
import { BottomNav } from './ui/components/BottomNav';
import { useCrossTabSync, useTheme, useTodaySync } from './ui/hooks/useAppLifecycle';
import { useHashRoute, type Route } from './ui/hooks/useHashRoute';
import { CheckingScreen } from './ui/screens/CheckingScreen';
import { HistoryScreen } from './ui/screens/HistoryScreen';
import { HomeScreen } from './ui/screens/HomeScreen';
import { InsightsScreen } from './ui/screens/InsightsScreen';
import { OnboardingScreen } from './ui/screens/OnboardingScreen';
import { PaywallScreen } from './ui/screens/PaywallScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
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
  const { access } = useEntitlement();
  // True only for the session in which onboarding was just completed (drives the one-time welcome).
  const [justOnboarded, setJustOnboarded] = useState(false);
  const finishOnboarding = useCallback(() => setJustOnboarded(true), []);

  useTheme();
  useTodaySync();
  useCrossTabSync();

  if (status === 'error') return <StorageErrorScreen />;
  if (!onboarded) {
    return (
      <div className="app app--flow">
        <OnboardingScreen onFinished={finishOnboarding} />
      </div>
    );
  }
  // There is no free tier: the app itself opens only with a current subscription (or its free trial).
  if (access.status === 'checking') {
    return (
      <div className="app app--flow">
        <CheckingScreen />
      </div>
    );
  }
  if (!access.entitled) {
    return (
      <div className="app app--flow">
        <UiProvider>
          <PaywallScreen />
        </UiProvider>
      </div>
    );
  }
  return (
    <UiProvider welcome={justOnboarded}>
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
