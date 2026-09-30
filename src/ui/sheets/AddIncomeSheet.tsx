import { useId, useRef, useState, type FormEvent } from 'react';
import { defaultDateForMonth, isValidLocalDate, MAX_YEAR, MIN_YEAR, toLocalDate } from '../../domain/dates';
import { amountToInput, MAX_AMOUNT, parseAmountInput, toMajor } from '../../domain/money';
import type { ErrorCode } from '../../domain/types';
import { MAX_NOTE_LENGTH } from '../../domain/validation';
import { quickAddAmounts } from '../../format/currencies';
import { useI18n } from '../../i18n/I18nProvider';
import { createId } from '../../lib/id';
import { useAppSelector, useAppStore } from '../../state/context';
import { AmountField } from '../components/AmountField';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useDismiss } from '../components/Modal';
import { Sheet } from '../components/Sheet';
import { haptic } from '../hooks/useAppLifecycle';
import { useDateLabel } from '../hooks/useDateLabel';
import { useErrorMessage } from '../hooks/useErrorMessage';
import { useUi } from '../UiContext';

interface AddIncomeSheetProps {
  /** Present when editing an existing entry. */
  entryId?: string;
  onClose: () => void;
}

type FieldErrors = Partial<Record<'amount' | 'date' | 'note' | 'form', ErrorCode>>;

const fieldOf = (code: ErrorCode): keyof FieldErrors => {
  if (code.startsWith('amount')) return 'amount';
  if (code === 'date-invalid') return 'date';
  if (code === 'note-too-long') return 'note';
  return 'form';
};

export function AddIncomeSheet({ entryId, onClose }: AddIncomeSheetProps) {
  const { t } = useI18n();
  const editing = entryId !== undefined;
  return (
    <Sheet title={editing ? t('income.edit.title') : t('income.add.title')} onClose={onClose}>
      <IncomeForm entryId={entryId} />
    </Sheet>
  );
}

function IncomeForm({ entryId }: { entryId?: string }) {
  const { t, fmt, currency } = useI18n();
  const store = useAppStore();
  const ui = useUi();
  const dismiss = useDismiss();
  const errorMessage = useErrorMessage();
  const dateLabel = useDateLabel();
  const ids = useId();

  const existing = useAppSelector((s) => (entryId ? s.data.entries.find((entry) => entry.id === entryId) : undefined));
  const selectedMonth = useAppSelector((s) => s.selectedMonth);
  const today = useAppSelector((s) => s.today);

  const [amount, setAmount] = useState(() => (existing ? amountToInput(existing.amount, currency, fmt.decimalMark) : ''));
  const [date, setDate] = useState(() => existing?.date ?? defaultDateForMonth(selectedMonth, today));
  const [note, setNote] = useState(() => existing?.note ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  // One draft id per opened sheet: a double tap or retry can never add the same income twice.
  const draftId = useRef(createId());
  const submitted = useRef(false);
  const dateInput = useRef<HTMLInputElement>(null);

  const editingMissing = entryId !== undefined && !existing;

  const clear = (field: keyof FieldErrors) => setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));

  const addQuick = (quick: number) => {
    const parsed = parseAmountInput(amount, currency);
    const base = parsed.ok ? parsed.amount : 0;
    setAmount(amountToInput(Math.min(base + quick, MAX_AMOUNT), currency, fmt.decimalMark));
    clear('amount');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (submitted.current) return;

    const parsed = parseAmountInput(amount, currency);
    if (!parsed.ok) {
      setErrors({ amount: parsed.error });
      return;
    }
    const fields = { amount: parsed.amount, date, note };
    const result = entryId
      ? store.updateIncome(entryId, fields)
      : store.addIncome({ id: draftId.current, ...fields });

    if (!result.ok) {
      setErrors({ [fieldOf(result.error)]: result.error });
      return;
    }
    submitted.current = true;
    ui.toast(entryId ? t('income.saved') : t('income.added', { amount: fmt.money(parsed.amount) }));
    haptic();
    dismiss();
  };

  const openDatePicker = () => {
    try {
      dateInput.current?.showPicker?.();
    } catch {
      /* the native control still works when tapped directly */
    }
  };

  const invalidDate = !isValidLocalDate(date);
  const quick = quickAddAmounts(currency);

  if (editingMissing) {
    return <p className="field-error">{errorMessage('not-found')}</p>;
  }

  return (
    <form className="income-form" onSubmit={submit} noValidate>
      <AmountField
        id={`${ids}-amount`}
        label={t('income.amount')}
        value={amount}
        onChange={(value) => {
          setAmount(value);
          clear('amount');
        }}
        error={errors.amount ? errorMessage(errors.amount) : null}
        autoFocus
      />

      {!entryId && (
        <div className="quick" role="group" aria-label={t('income.quickAdd')}>
          {quick.map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-label={t('income.quickAdd.aria', { amount: fmt.money(value) })}
              onClick={() => addQuick(value)}
            >
              +{fmt.integer(toMajor(value))}
            </button>
          ))}
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor={`${ids}-date`}>
          {t('income.date')}
        </label>
        <div className="date-field" onClick={openDatePicker}>
          <Icon name="calendar" size={20} />
          <span className="date-field__value">{invalidDate ? '—' : dateLabel(date)}</span>
          <Icon name="chevronDown" size={18} className="date-field__caret" />
          <input
            ref={dateInput}
            id={`${ids}-date`}
            className="date-field__input"
            type="date"
            value={date}
            min={toLocalDate(MIN_YEAR, 1, 1)}
            max={toLocalDate(MAX_YEAR, 12, 31)}
            onChange={(event) => {
              setDate(event.target.value);
              clear('date');
            }}
            aria-invalid={errors.date ? 'true' : undefined}
            aria-describedby={errors.date ? `${ids}-date-error` : undefined}
          />
        </div>
        {errors.date && (
          <p id={`${ids}-date-error`} className="field-error" role="alert">
            <Icon name="alert" size={16} />
            <span>{errorMessage(errors.date)}</span>
          </p>
        )}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${ids}-note`}>
          {t('income.note')} <span className="field__optional">· {t('income.note.optional')}</span>
        </label>
        <input
          id={`${ids}-note`}
          className="text-input"
          type="text"
          value={note}
          maxLength={MAX_NOTE_LENGTH + 40}
          placeholder={t('income.note.placeholder')}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(event) => {
            setNote(event.target.value);
            clear('note');
          }}
          aria-invalid={errors.note ? 'true' : undefined}
        />
        {errors.note && (
          <p className="field-error" role="alert">
            <Icon name="alert" size={16} />
            <span>{errorMessage(errors.note)}</span>
          </p>
        )}
      </div>

      {errors.form && (
        <p className="field-error" role="alert">
          <Icon name="alert" size={16} />
          <span>{errorMessage(errors.form)}</span>
        </p>
      )}

      <Button type="submit" block className="income-form__submit">
        {entryId ? t('income.submit.save') : t('income.submit.add')}
      </Button>
    </form>
  );
}
