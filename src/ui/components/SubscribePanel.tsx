import { useEffect } from 'react';
import { useEntitlement, useEntitlementStore } from '../../billing/context';
import type { Access, BillingErrorCode, ProductInfo } from '../../billing/types';
import type { MessageKey } from '../../i18n';
import { LANGUAGES } from '../../i18n/languages';
import { useI18n } from '../../i18n/I18nProvider';
import { Button } from './Button';
import { Icon } from './Icon';

const ERROR_KEYS: Record<BillingErrorCode, MessageKey> = {
  'billing-unavailable': 'paywall.error.billing',
  'service-unavailable': 'paywall.error.service',
  'item-unavailable': 'paywall.error.item',
  'developer-error': 'paywall.error.generic',
  unknown: 'paywall.error.generic',
};

/** The headline that matches what the person is looking at. */
export function paywallTitleKey(access: Access, product: ProductInfo | null): MessageKey {
  switch (access.status) {
    case 'unverified':
      return 'paywall.title.unverified';
    case 'pending':
      return 'paywall.title.pending';
    case 'unavailable':
      return 'paywall.title.unavailable';
    default:
      if (access.lapsed) return 'paywall.title.lapsed';
      return product?.trialDays ? 'paywall.title.trial' : 'paywall.title.subscribe';
  }
}

/**
 * The offer, the buttons and the honest small print. Shared by the third onboarding step and by the locked
 * screen. Everything about price and trial comes from Google Play; nothing here decides who has access.
 */
export function SubscribePanel() {
  const { t, tn } = useI18n();
  const store = useEntitlementStore();
  const { access, product, productError, busy, error, notice, gateway } = useEntitlement();

  const needsProduct = access.status === 'inactive' && gateway !== 'none';
  useEffect(() => {
    if (needsProduct && !product && !productError) void store.loadProduct();
  }, [needsProduct, product, productError, store]);

  const working = busy === 'purchase' || busy === 'restore';
  const shownError = error ?? (access.status === 'inactive' ? productError : null);

  return (
    <div className="paywall">
      {access.status === 'checking' && (
        <p className="paywall__status" role="status">
          {t('paywall.checking')}
        </p>
      )}

      {access.status === 'unavailable' && <p className="paywall__status">{t('paywall.unavailable')}</p>}

      {access.status === 'pending' && <p className="paywall__status">{t('paywall.pending')}</p>}

      {access.status === 'unverified' && <p className="paywall__status">{t('paywall.unverified')}</p>}

      {access.status === 'inactive' && (
        <>
          <ul className="paywall__features">
            {(
              [
                t('paywall.feature.track'),
                t('paywall.feature.insights'),
                t('paywall.feature.languages', { count: LANGUAGES.length }),
                t('paywall.feature.private'),
              ] as const
            ).map((text) => (
              <li key={text}>
                <Icon name="check" size={18} />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <div className="paywall__offer" aria-live="polite">
            {product ? (
              product.trialDays ? (
                <>
                  <p className="paywall__offer-main">{tn('paywall.offer.trial', product.trialDays)}</p>
                  <p className="paywall__offer-then">{t('paywall.offer.then', { price: product.formattedPrice })}</p>
                </>
              ) : (
                <p className="paywall__offer-main">{t('paywall.offer.price', { price: product.formattedPrice })}</p>
              )
            ) : productError ? null : (
              <p className="paywall__offer-then">{t('paywall.offer.loading')}</p>
            )}
          </div>
        </>
      )}

      <div className="paywall__message" role="status">
        {notice === 'restored' && <p>{t('paywall.notice.restored')}</p>}
        {notice === 'nothing-to-restore' && <p>{t('paywall.notice.nothing')}</p>}
        {notice === 'purchase-pending' && access.status !== 'pending' && <p>{t('paywall.pending')}</p>}
      </div>
      {shownError ? (
        <p className="field-error" role="alert">
          <Icon name="alert" size={16} />
          <span>{t(ERROR_KEYS[shownError])}</span>
        </p>
      ) : null}

      <div className="paywall__actions">
        {access.status === 'inactive' && product && (
          <Button block className="cta" disabled={working} aria-busy={busy === 'purchase' || undefined} onClick={() => void store.purchase()}>
            {product.trialDays ? t('paywall.cta.trial') : t('paywall.cta.subscribe')}
          </Button>
        )}
        {access.status === 'inactive' && !product && productError && (
          <Button block className="cta" onClick={() => void store.loadProduct()}>
            {t('common.retry')}
          </Button>
        )}
        {(access.status === 'unverified' || access.status === 'pending') && (
          <Button block className="cta" disabled={busy !== null} onClick={() => void store.refresh()}>
            {t('common.retry')}
          </Button>
        )}
        {access.status !== 'unavailable' && access.status !== 'checking' && (
          <Button variant="ghost" block disabled={working} aria-busy={busy === 'restore' || undefined} onClick={() => void store.restore()}>
            {t('paywall.restore')}
          </Button>
        )}
      </div>

      {access.status === 'inactive' && product && (
        <p className="paywall__terms">
          {product.trialDays ? t('paywall.terms.trial', { price: product.formattedPrice }) : t('paywall.terms.subscribe', { price: product.formattedPrice })}
        </p>
      )}
    </div>
  );
}
