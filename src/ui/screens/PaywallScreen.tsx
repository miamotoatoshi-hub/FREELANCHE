import { useState } from 'react';
import { useEntitlement } from '../../billing/context';
import { useI18n } from '../../i18n/I18nProvider';
import { languageInfo } from '../../i18n/languages';
import { useAppStore } from '../../state/context';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/LogoMark';
import { paywallTitleKey, SubscribePanel } from '../components/SubscribePanel';
import { useErrorMessage } from '../hooks/useErrorMessage';
import { useExportCsv } from '../hooks/useExportCsv';
import { InfoSheet } from '../sheets/InfoSheet';
import { LanguageSheet } from '../sheets/LanguageSheet';
import { useUi } from '../UiContext';

type Overlay = 'language' | 'privacy' | 'delete-all' | null;

/**
 * What a person without a current subscription sees. There is no free tier, so this is the whole app —
 * except that their own data is never held hostage: they can still export it, change the language,
 * read the privacy notice, or erase everything.
 */
export function PaywallScreen() {
  const { t, language } = useI18n();
  const { access, product } = useEntitlement();
  const store = useAppStore();
  const ui = useUi();
  const errorMessage = useErrorMessage();
  const exportCsv = useExportCsv();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const native = languageInfo(language);

  const deleteAll = () => {
    const result = store.deleteAllData();
    setOverlay(null);
    if (!result.ok) ui.toast(errorMessage(result.error));
  };

  return (
    <main className="onboarding paywall-screen">
      <div className="onboarding__body">
        <LogoMark size={56} animated />
        <h1 className="onboarding__title">{t(paywallTitleKey(access, product))}</h1>
        <p className="onboarding__hint onboarding__hint--start">{access.lapsed ? t('paywall.subtitle.lapsed') : t('paywall.subtitle')}</p>
        <SubscribePanel />

        <section className="paywall__data" aria-labelledby="paywall-data-title">
          <h2 id="paywall-data-title" className="paywall__data-title">
            {t('paywall.yourData')}
          </h2>
          <p className="paywall__data-text">{t('paywall.yourData.text')}</p>
          <div className="paywall__links">
            <button type="button" className="link-btn" onClick={() => void exportCsv()}>
              <Icon name="download" size={18} />
              {t('settings.export')}
            </button>
            <button type="button" className="link-btn" onClick={() => setOverlay('language')} lang={native.code} dir={native.dir}>
              {native.nativeName}
            </button>
            <button type="button" className="link-btn" onClick={() => setOverlay('privacy')}>
              {t('settings.privacy')}
            </button>
            <button type="button" className="link-btn link-btn--danger" onClick={() => setOverlay('delete-all')}>
              <Icon name="trash" size={18} />
              {t('settings.deleteAll')}
            </button>
          </div>
        </section>
      </div>

      {overlay === 'language' && <LanguageSheet onClose={() => setOverlay(null)} />}
      {overlay === 'privacy' && (
        <InfoSheet
          title={t('privacy.title')}
          paragraphs={[t('privacy.p1'), t('privacy.p2'), t('privacy.p3'), t('privacy.p4')]}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'delete-all' && (
        <ConfirmationDialog
          title={t('deleteAll.title')}
          description={t('deleteAll.text')}
          confirmLabel={t('deleteAll.confirm')}
          tone="danger"
          onConfirm={deleteAll}
          onCancel={() => setOverlay(null)}
        />
      )}
    </main>
  );
}
