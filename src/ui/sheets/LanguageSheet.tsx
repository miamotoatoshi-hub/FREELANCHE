import { useI18n } from '../../i18n/I18nProvider';
import { LanguageSelector } from '../components/LanguageSelector';
import { useDismiss } from '../components/Modal';
import { Sheet } from '../components/Sheet';
import { useChangeLanguage } from '../hooks/useChangeLanguage';

export function LanguageSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet title={t('settings.language')} onClose={onClose}>
      <LanguageChoices />
    </Sheet>
  );
}

function LanguageChoices() {
  const { language } = useI18n();
  const changeLanguage = useChangeLanguage();
  const dismiss = useDismiss();
  return (
    <LanguageSelector
      value={language}
      onSelect={(code) => {
        // The interface switches as soon as the new strings are in; then the sheet closes.
        void changeLanguage(code).then(dismiss);
      }}
    />
  );
}
