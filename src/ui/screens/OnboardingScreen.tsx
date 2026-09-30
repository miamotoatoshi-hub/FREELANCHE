import { useId, useState, type FormEvent } from 'react';
import { amountToInput, parseAmountInput, STORAGE_SCALE } from '../../domain/money';
import type { ErrorCode } from '../../domain/types';
import { goalPresets } from '../../format/currencies';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppStore } from '../../state/context';
import { AmountField } from '../components/AmountField';
import { Button } from '../components/Button';
import { CurrencySelector } from '../components/CurrencySelector';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/LogoMark';
import { useErrorMessage } from '../hooks/useErrorMessage';

const STEPS = 4;

/** Welcome → goal → currency → ready. Four short steps, no account. */
export function OnboardingScreen() {
  const { t, fmt, currency } = useI18n();
  const store = useAppStore();
  const errorMessage = useErrorMessage();
  const goalId = useId();

  const [step, setStep] = useState(0);
  const [goalText, setGoalText] = useState('');
  const [goalError, setGoalError] = useState<ErrorCode | null>(null);
  const [failed, setFailed] = useState<ErrorCode | null>(null);

  const submitGoal = (event?: FormEvent) => {
    event?.preventDefault();
    if (goalText.trim() !== '') {
      const parsed = parseAmountInput(goalText, currency);
      if (!parsed.ok) {
        setGoalError(parsed.error);
        return;
      }
    }
    setStep(2);
  };

  const finish = () => {
    // The goal is optional: an empty field means "set it later".
    const parsed = goalText.trim() === '' ? null : parseAmountInput(goalText, currency);
    let goal = parsed?.ok ? parsed.amount : 0;
    // If the currency was switched to one without decimals after typing, keep whole units.
    goal = currency === 'JPY' || currency === 'KRW' ? Math.round(goal / STORAGE_SCALE) * STORAGE_SCALE : goal;
    const result = store.completeOnboarding({ goal, currency });
    if (!result.ok) setFailed(result.error);
  };

  return (
    <main className="onboarding" data-step={step}>
      <div className="onboarding__top">
        {step > 0 ? (
          <button type="button" className="icon-btn" aria-label={t('common.back')} onClick={() => setStep(step - 1)}>
            <Icon name="chevronLeft" />
          </button>
        ) : (
          <span className="onboarding__spacer" />
        )}
        <ol className="dots" aria-label={t('onboarding.step', { current: step + 1, total: STEPS })}>
          {Array.from({ length: STEPS }, (_, i) => (
            <li key={i} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined} />
          ))}
        </ol>
        <span className="onboarding__spacer" />
      </div>

      <div className="onboarding__step" key={step}>
        {step === 0 && (
          <>
            <div className="onboarding__hero">
              <LogoMark size={88} />
              <h1 className="onboarding__title">{t('onboarding.welcome.title')}</h1>
              <p className="onboarding__text">{t('onboarding.welcome.subtitle')}</p>
            </div>
            <div className="onboarding__actions">
              <Button block className="cta" onClick={() => setStep(1)}>
                {t('onboarding.welcome.cta')}
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <form className="onboarding__form" onSubmit={submitGoal} noValidate>
            <div className="onboarding__body">
              <h1 className="onboarding__title">{t('onboarding.goal.title')}</h1>
              <AmountField
                id={goalId}
                label={t('goal.amountLabel')}
                value={goalText}
                onChange={(value) => {
                  setGoalText(value);
                  setGoalError(null);
                }}
                error={goalError ? errorMessage(goalError) : null}
                autoFocus
              />
              <div className="quick quick--wrap" role="group" aria-label={t('onboarding.goal.title')}>
                {goalPresets(currency).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setGoalText(amountToInput(value, currency, fmt.decimalMark));
                      setGoalError(null);
                    }}
                  >
                    {fmt.money(value)}
                  </button>
                ))}
              </div>
              <p className="onboarding__hint">{t('onboarding.goal.hint')}</p>
            </div>
            <div className="onboarding__actions">
              <Button type="submit" block className="cta">
                {t('common.continue')}
              </Button>
              <Button
                variant="ghost"
                block
                onClick={() => {
                  setGoalText('');
                  setGoalError(null);
                  setStep(2);
                }}
              >
                {t('onboarding.goal.skip')}
              </Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <>
            <div className="onboarding__body">
              <h1 className="onboarding__title">{t('onboarding.currency.title')}</h1>
              <p className="onboarding__hint">{t('onboarding.currency.hint')}</p>
              <CurrencySelector value={currency} onSelect={(code) => void store.changeCurrency(code)} />
            </div>
            <div className="onboarding__actions">
              <Button block className="cta" onClick={() => setStep(3)}>
                {t('common.continue')}
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="onboarding__hero">
              <div className="onboarding__check">
                <Icon name="check" size={40} />
              </div>
              <h1 className="onboarding__title">{t('onboarding.done.title')}</h1>
              <p className="onboarding__text">{t('onboarding.done.subtitle')}</p>
              {failed && (
                <p className="field-error" role="alert">
                  <Icon name="alert" size={16} />
                  <span>{errorMessage(failed)}</span>
                </p>
              )}
            </div>
            <div className="onboarding__actions">
              <Button block className="cta" onClick={finish}>
                {t('onboarding.done.cta')}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
