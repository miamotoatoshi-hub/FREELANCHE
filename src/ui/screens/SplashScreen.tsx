import { useEffect } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { LogoMark } from '../components/LogoMark';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

/** First launch only: a short, calm hello. Tap anywhere to skip. */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    const timer = window.setTimeout(onDone, prefersReducedMotion() ? 500 : 1100);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="splash" onClick={onDone} role="presentation">
      <LogoMark size={96} animated />
      <p className="splash__name">{t('app.name')}</p>
      <p className="splash__tagline">{t('app.tagline')}</p>
    </div>
  );
}
