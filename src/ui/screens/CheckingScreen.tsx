import { useI18n } from '../../i18n/I18nProvider';
import { LogoMark } from '../components/LogoMark';

/** Shown only if Google Play is slow to answer the very first check; normally the app opens straight past it. */
export function CheckingScreen() {
  const { t } = useI18n();
  return (
    <main className="onboarding">
      <div className="onboarding__hero">
        <LogoMark size={72} animated />
        <p className="onboarding__text" role="status">
          {t('paywall.checking')}
        </p>
      </div>
    </main>
  );
}
