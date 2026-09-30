import { useId, useState, type FormEvent } from 'react';
import { resolveMonthlyGoal } from '../../domain/goals';
import { amountToInput, parseAmountInput } from '../../domain/money';
import type { ErrorCode, YearMonth } from '../../domain/types';
import { goalPresets } from '../../format/currencies';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppSelector, useAppStore } from '../../state/context';
import { AmountField } from '../components/AmountField';
import { Button } from '../components/Button';
import { useDismiss } from '../components/Modal';
import { Sheet } from '../components/Sheet';
import { useErrorMessage } from '../hooks/useErrorMessage';
import { useUi } from '../UiContext';

interface GoalSheetProps {
  ym: YearMonth;
  scope: 'month' | 'fromNow';
  onClose: () => void;
}

export function GoalSheet({ ym, scope, onClose }: GoalSheetProps) {
  const { t } = useI18n();
  return (
    <Sheet title={t('goalSheet.title')} onClose={onClose}>
      <GoalForm ym={ym} scope={scope} />
    </Sheet>
  );
}

function GoalForm({ ym, scope }: Pick<GoalSheetProps, 'ym' | 'scope'>) {
  const { t, fmt, currency } = useI18n();
  const store = useAppStore();
  const ui = useUi();
  const dismiss = useDismiss();
  const errorMessage = useErrorMessage();
  const id = useId();

  const goals = useAppSelector((s) => s.data.goals);
  const defaultGoal = useAppSelector((s) => s.data.settings.defaultMonthlyGoal);
  const current = resolveMonthlyGoal(goals, ym, defaultGoal).amount;

  const [text, setText] = useState(() => (current > 0 ? amountToInput(current, currency, fmt.decimalMark) : ''));
  const [error, setError] = useState<ErrorCode | null>(null);

  const save = (amount: number) => {
    const result = scope === 'fromNow' ? store.setGoalFromNow(amount) : store.setMonthGoal(ym, amount);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    ui.toast(amount > 0 ? t('goalSheet.saved') : t('goalSheet.removed'));
    dismiss();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseAmountInput(text, currency);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (parsed.amount === 0) {
      setError('goal-invalid');
      return;
    }
    save(parsed.amount);
  };

  return (
    <form className="income-form" onSubmit={submit} noValidate>
      <p className="sheet__hint">{scope === 'fromNow' ? t('settings.goal.hint') : `${t('goalSheet.for', { month: fmt.monthName(ym) })}. ${t('goalSheet.hint')}`}</p>
      <AmountField
        id={`${id}-goal`}
        label={t('goal.amountLabel')}
        value={text}
        onChange={(value) => {
          setText(value);
          setError(null);
        }}
        error={error ? errorMessage(error) : null}
        autoFocus
      />
      <div className="quick quick--wrap" role="group" aria-label={t('goalSheet.title')}>
        {goalPresets(currency).map((value) => (
          <button
            key={value}
            type="button"
            className="chip"
            onClick={() => {
              setText(amountToInput(value, currency, fmt.decimalMark));
              setError(null);
            }}
          >
            {fmt.money(value)}
          </button>
        ))}
      </div>
      <Button type="submit" block className="income-form__submit">
        {t('goalSheet.save')}
      </Button>
      {current > 0 && (
        <Button variant="ghost" block onClick={() => save(0)}>
          {t('goalSheet.remove')}
        </Button>
      )}
    </form>
  );
}
