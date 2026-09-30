import { useCallback } from 'react';
import { addDays } from '../../domain/dates';
import type { LocalDate } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppSelector } from '../../state/context';

/** "Today", "Yesterday", or "September 27" — relative to the user's current day. */
export function useDateLabel(): (date: LocalDate) => string {
  const { t, fmt } = useI18n();
  const today = useAppSelector((s) => s.today);
  return useCallback(
    (date) => {
      if (date === today) return t('date.today');
      if (date === addDays(today, -1)) return t('date.yesterday');
      return date.slice(0, 4) === today.slice(0, 4) ? fmt.dayMonth(date) : fmt.dayMonthYear(date);
    },
    [t, fmt, today],
  );
}
