import { useI18n } from '../../i18n/I18nProvider';
import { useAppStore } from '../../state/context';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';

/** Shown only if saved data exists but can't be read. Nothing is deleted unless the person chooses to start fresh. */
export function StorageErrorScreen() {
  const { t } = useI18n();
  const store = useAppStore();
  return (
    <main className="onboarding">
      <div className="onboarding__step">
        <div className="onboarding__hero">
          <div className="onboarding__check onboarding__check--warn">
            <Icon name="alert" size={40} />
          </div>
          <h1 className="onboarding__title">{t('storageError.title')}</h1>
          <p className="onboarding__text">{t('storageError.text')}</p>
        </div>
        <div className="onboarding__actions">
          <Button block className="cta" onClick={() => store.reload()}>
            {t('common.retry')}
          </Button>
          <Button variant="ghost" block onClick={() => store.startFresh()}>
            {t('storageError.fresh')}
          </Button>
        </div>
      </div>
    </main>
  );
}
