import { daysInMonth, dayOfWeek, firstDayOf, toLocalDate } from '../../domain/dates';
import type { LocalDate, YearMonth } from '../../domain/types';
import { firstDayOfWeek } from '../../format/locale';
import { useI18n } from '../../i18n/I18nProvider';

interface CalendarProps {
  ym: YearMonth;
  /** Stored income total per date; days with income get a dot. */
  totals: ReadonlyMap<LocalDate, number>;
  today: LocalDate;
  selected: LocalDate | null;
  onSelect: (date: LocalDate | null) => void;
}

/** A plain month grid — pick a day to see its total and entries. Nothing more. */
export function Calendar({ ym, totals, today, selected, onSelect }: CalendarProps) {
  const { t, fmt } = useI18n();
  const weekStart = firstDayOfWeek(fmt.locale);
  const total = daysInMonth(ym.year, ym.month);
  const offset = (dayOfWeek(firstDayOf(ym)) - weekStart + 7) % 7;
  const weekdays = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);

  return (
    <div className="calendar">
      <div className="calendar__weekdays" aria-hidden="true">
        {weekdays.map((weekday) => (
          <span key={weekday}>{fmt.weekday(weekday)}</span>
        ))}
      </div>
      <div className="calendar__grid">
        {Array.from({ length: offset }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: total }, (_, i) => {
          const day = i + 1;
          const date = toLocalDate(ym.year, ym.month, day);
          const amount = totals.get(date) ?? 0;
          const isSelected = date === selected;
          const label =
            amount > 0
              ? t('history.calendar.day', { date: fmt.fullDate(date), amount: fmt.money(amount) })
              : t('history.calendar.dayEmpty', { date: fmt.fullDate(date) });
          return (
            <button
              key={date}
              type="button"
              className={`calendar__day${isSelected ? ' is-selected' : ''}${date === today ? ' is-today' : ''}${amount > 0 ? ' has-income' : ''}`}
              aria-label={label}
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : date)}
            >
              <span>{day}</span>
              {amount > 0 ? <i className="calendar__dot" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
