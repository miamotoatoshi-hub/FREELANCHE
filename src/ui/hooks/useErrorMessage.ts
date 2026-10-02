import { useCallback } from 'react';
import { currencyFractionDigits } from '../../domain/money';
import type { ErrorCode } from '../../domain/types';
import { MAX_NAME_LENGTH, MAX_NOTE_LENGTH } from '../../domain/validation';
import { useI18n } from '../../i18n/I18nProvider';

/** Turns a machine error code into a plain-language sentence. Never exposes technical detail. */
export function useErrorMessage(): (code: ErrorCode | null | undefined) => string {
  const { t, currency } = useI18n();
  return useCallback(
    (code) => {
      if (!code) return '';
      if (code === 'amount-decimals' && currencyFractionDigits(currency) === 0) return t('error.amount-decimals-none');
      if (code === 'note-too-long') return t('error.note-too-long', { max: MAX_NOTE_LENGTH });
      if (code === 'name-too-long') return t('error.name-too-long', { max: MAX_NAME_LENGTH });
      return t(`error.${code}`);
    },
    [t, currency],
  );
}
