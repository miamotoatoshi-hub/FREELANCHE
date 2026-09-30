import { addMonths, clampMonth, compareMonths, monthOf } from '../../domain/dates';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppSelector, useAppStore } from '../../state/context';
import { Icon } from './Icon';

/** ← September 2026 → . Drives the month shown on Home, History and Insights. */
export function MonthSelector() {
  const { t, fmt } = useI18n();
  const store = useAppStore();
  const selected = useAppSelector((s) => s.selectedMonth);
  const today = useAppSelector((s) => s.today);

  const current = monthOf(today);
  const canGoBack = compareMonths(clampMonth(addMonths(selected, -1), today), selected) !== 0;
  const canGoForward = compareMonths(clampMonth(addMonths(selected, 1), today), selected) !== 0;
  const isCurrent = compareMonths(selected, current) === 0;

  return (
    <div className="month" role="group" aria-label={t('month.selector')}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t('month.previous')}
        disabled={!canGoBack}
        onClick={() => store.stepMonth(-1)}
      >
        <Icon name="chevronLeft" />
      </button>
      <div className="month__label">
        <span className="month__name" aria-live="polite">
          {fmt.monthYear(selected)}
        </span>
        {!isCurrent && (
          <button type="button" className="month__back" onClick={() => store.selectMonth(current)}>
            {t('month.backToCurrent')}
          </button>
        )}
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label={t('month.next')}
        disabled={!canGoForward}
        onClick={() => store.stepMonth(1)}
      >
        <Icon name="chevronRight" />
      </button>
    </div>
  );
}
