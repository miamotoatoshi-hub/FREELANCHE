import { useMemo, useState } from 'react';
import { isInMonth } from '../../domain/dates';
import type { IncomeEntry, LocalDate } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppSelector, useAppStore } from '../../state/context';
import { Button } from '../components/Button';
import { Calendar } from '../components/Calendar';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { IncomeAmount } from '../components/IncomeAmount';
import { IncomeEntryRow } from '../components/IncomeEntryRow';
import { MonthSelector } from '../components/MonthSelector';
import { useDateLabel } from '../hooks/useDateLabel';
import { useErrorMessage } from '../hooks/useErrorMessage';
import { useUi } from '../UiContext';

interface DayGroup {
  date: LocalDate;
  total: number;
  entries: IncomeEntry[];
}

/** Newest day first; within a day, newest entry first (ties keep later-added first). */
function groupByDate(entries: readonly IncomeEntry[]): DayGroup[] {
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt) || b.index - a.index)
    .map(({ entry }) => entry);
  const groups = new Map<LocalDate, DayGroup>();
  for (const entry of ordered) {
    const group = groups.get(entry.date) ?? { date: entry.date, total: 0, entries: [] };
    group.total += entry.amount;
    group.entries.push(entry);
    groups.set(entry.date, group);
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function HistoryScreen() {
  const { t, tn, fmt } = useI18n();
  const ui = useUi();
  const store = useAppStore();
  const errorMessage = useErrorMessage();
  const dateLabel = useDateLabel();

  const entries = useAppSelector((s) => s.data.entries);
  const ym = useAppSelector((s) => s.selectedMonth);
  const today = useAppSelector((s) => s.today);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pickedDay, setPickedDay] = useState<LocalDate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IncomeEntry | null>(null);

  const monthEntries = useMemo(() => entries.filter((entry) => isInMonth(entry.date, ym)), [entries, ym]);
  const monthTotal = useMemo(() => monthEntries.reduce((sum, entry) => sum + entry.amount, 0), [monthEntries]);
  const totals = useMemo(() => {
    const map = new Map<LocalDate, number>();
    for (const entry of monthEntries) map.set(entry.date, (map.get(entry.date) ?? 0) + entry.amount);
    return map;
  }, [monthEntries]);

  // A picked day only applies while it belongs to the month being shown.
  const day = pickedDay && isInMonth(pickedDay, ym) ? pickedDay : null;
  const visible = useMemo(() => (day ? monthEntries.filter((entry) => entry.date === day) : monthEntries), [monthEntries, day]);
  const groups = useMemo(() => groupByDate(visible), [visible]);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const result = store.deleteIncome(pendingDelete.id);
    ui.toast(result.ok ? t('income.deleted') : errorMessage(result.error));
    setPendingDelete(null);
  };

  return (
    <div className="screen screen--with-cta">
      <header className="topbar">
        <h1 className="title">{t('history.title')}</h1>
        <button
          type="button"
          className={`icon-btn${calendarOpen ? ' is-active' : ''}`}
          aria-pressed={calendarOpen}
          aria-label={calendarOpen ? t('history.calendar.hide') : t('history.calendar.show')}
          onClick={() => setCalendarOpen((open) => !open)}
        >
          <Icon name={calendarOpen ? 'list' : 'calendar'} />
        </button>
      </header>
      <MonthSelector />

      {monthEntries.length === 0 ? (
        <EmptyState icon="history" title={t('history.empty.title')} text={t('history.empty.text')} />
      ) : (
        <>
          <p className="summary-line">{tn('history.summary', monthEntries.length, { amount: fmt.money(monthTotal) })}</p>

          {calendarOpen && (
            <section className="card card--calendar">
              <Calendar ym={ym} totals={totals} today={today} selected={day} onSelect={setPickedDay} />
              {day && (
                <div className="calendar__summary">
                  <p>
                    {t('history.day.total', { date: fmt.dayMonth(day), amount: fmt.money(totals.get(day) ?? 0) })}
                  </p>
                  <button type="button" className="link-btn" onClick={() => setPickedDay(null)}>
                    {t('history.day.clear')}
                  </button>
                </div>
              )}
            </section>
          )}

          {day && visible.length === 0 && <p className="muted">{t('history.day.none')}</p>}

          <div className="groups">
            {groups.map((group) => (
              <section key={group.date} className="group">
                <h2 className="group__head">
                  <span>{dateLabel(group.date)}</span>
                  <IncomeAmount value={group.total} size="sm" className="group__total" />
                </h2>
                <ul className="entries">
                  {group.entries.map((entry) => (
                    <IncomeEntryRow key={entry.id} entry={entry} onEdit={(e) => ui.openEditIncome(e.id)} onDelete={setPendingDelete} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <div className="cta-bar">
        <Button block className="cta" onClick={ui.openAddIncome}>
          <Icon name="plus" size={22} />
          {t('home.add')}
        </Button>
      </div>

      {pendingDelete && (
        <ConfirmationDialog
          title={t('delete.title')}
          description={t('delete.text', { amount: fmt.money(pendingDelete.amount) })}
          confirmLabel={t('common.delete')}
          tone="danger"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
