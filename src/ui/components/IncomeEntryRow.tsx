import type { IncomeEntry } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { EntryMenu } from './EntryMenu';
import { IncomeAmount } from './IncomeAmount';

interface IncomeEntryRowProps {
  entry: IncomeEntry;
  onEdit: (entry: IncomeEntry) => void;
  onDelete: (entry: IncomeEntry) => void;
}

/** One income entry: tap the row to edit, use ⋯ for Edit / Delete. */
export function IncomeEntryRow({ entry, onEdit, onDelete }: IncomeEntryRowProps) {
  const { t, fmt } = useI18n();
  return (
    <li className="entry">
      <button type="button" className="entry__main" onClick={() => onEdit(entry)}>
        <span className="entry__mark" aria-hidden="true" />
        <span className="entry__text">
          <span className={`entry__note${entry.note ? '' : ' is-empty'}`}>{entry.note ?? t('history.entry.noNote')}</span>
          <span className="entry__date">{fmt.shortDate(entry.date)}</span>
        </span>
        <IncomeAmount value={entry.amount} size="sm" className="entry__amount" />
      </button>
      <EntryMenu
        label={t('history.entry.menu', { amount: fmt.money(entry.amount) })}
        onEdit={() => onEdit(entry)}
        onDelete={() => onDelete(entry)}
      />
    </li>
  );
}
