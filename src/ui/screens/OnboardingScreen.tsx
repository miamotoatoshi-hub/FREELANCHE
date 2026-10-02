import { useId, useState, type FormEvent } from 'react';
import { amountToInput, parseAmountInput, STORAGE_SCALE } from '../../domain/money';
import type { ErrorCode } from '../../domain/types';
import { MAX_NAME_LENGTH } from '../../domain/validation';
import { exampleGoal, goalPresets, suggestCurrency } from '../../format/currencies';
import { deviceLocales } from '../../format/locale';
import { useEntitlement } from '../../billing/context';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppStore } from '../../state/context';
import { AmountField } from '../components/AmountField';
import { Button } from '../components/Button';
import { CurrencySelector } from '../components/CurrencySelector';
import { Icon } from '../components/Icon';
import { LanguageSelector } from '../components/LanguageSelector';
import { LogoMark } from '../components/LogoMark';
import { paywallTitleKey, SubscribePanel } from '../components/SubscribePanel';
import { useChangeLanguage } from '../hooks/useChangeLanguage';
import { useErrorMessage } from '../hooks/useErrorMessage';

const STEPS = 5;
type Step = 0 | 1 | 2 | 3 | 4;

/**
 * First launch, in this order: language → name → free trial → currency → income goal.
 *
 * The third step is the account: there is no separate sign-up — the Google account that Google Play
 * already uses holds the subscription (and restores it on any phone), so starting the free trial *is*
 * registering. Nothing after it opens until a subscription is active.
 *
 * The language applies the moment it is picked. The currency is asked *before* the goal and is never
 * assumed — the goal field then shows the chosen currency. Everything typed survives going back.
 */
export function OnboardingScreen({ onFinished }: { onFinished: () => void }) {
  const { t, fmt, language, currency } = useI18n();
  const store = useAppStore();
  const { access, product } = useEntitlement();
  const changeLanguage = useChangeLanguage();
  const errorMessage = useErrorMessage();
  const nameId = useId();
  const goalId = useId();

  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState(() => store.getSnapshot().data.settings.name);
  const [nameError, setNameError] = useState<ErrorCode | null>(null);
  // Not pre-selected from the device: the person chooses their currency themselves.
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState(false);
  const [goalText, setGoalText] = useState('');
  const [goalError, setGoalError] = useState<ErrorCode | null>(null);
  const [failed, setFailed] = useState<ErrorCode | null>(null);

  const back = () => setStep((current) => Math.max(0, current - 1) as Step);

  const submitName = (event?: FormEvent, skip = false) => {
    event?.preventDefault();
    const result = store.setName(skip ? '' : name);
    if (!result.ok) {
      setNameError(result.error);
      return;
    }
    if (skip) setName('');
    setNameError(null);
    setStep(2);
  };

  const chooseCurrency = (code: string) => {
    const result = store.changeCurrency(code);
    if (!result.ok) {
      setFailed(result.error);
      return;
    }
    setChosenCurrency(code);
    setCurrencyError(false);
    setFailed(null);
  };

  const submitCurrency = () => {
    if (!chosenCurrency) {
      setCurrencyError(true);
      return;
    }
    setStep(4);
  };

  const finish = (event?: FormEvent, skipGoal = false) => {
    event?.preventDefault();
    let goal = 0;
    if (!skipGoal && goalText.trim() !== '') {
      const parsed = parseAmountInput(goalText, currency);
      if (!parsed.ok) {
        setGoalError(parsed.error);
        return;
      }
      goal = parsed.amount;
    }
    const result = store.completeOnboarding({ goal, currency });
    if (!result.ok) {
      setFailed(result.error);
      return;
    }
    onFinished();
  };

  const presets = goalPresets(currency);
  const example = fmt.digits(String(exampleGoal(currency) / STORAGE_SCALE));

  return (
    <main className="onboarding" data-step={step}>
      <div className="onboarding__top">
        {step > 0 ? (
          <button type="button" className="icon-btn" aria-label={t('common.back')} onClick={back}>
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
        <p className="onboarding__progress">{t('onboarding.step', { current: step + 1, total: STEPS })}</p>

        {step === 0 && (
          <>
            <div className="onboarding__body">
              <LogoMark size={56} animated />
              <h1 className="onboarding__title">{t('onboarding.language.title')}</h1>
              <p className="onboarding__hint onboarding__hint--start">{t('onboarding.language.hint')}</p>
              <LanguageSelector value={language} onSelect={(code) => void changeLanguage(code)} />
            </div>
            <div className="onboarding__actions">
              <Button block className="cta" onClick={() => setStep(1)}>
                {t('common.continue')}
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <form className="onboarding__form" onSubmit={submitName} noValidate>
            <div className="onboarding__body">
              <h1 className="onboarding__title">{t('onboarding.name.title')}</h1>
              <div className="field">
                <label className="field__label" htmlFor={nameId}>
                  {t('name.label')}
                </label>
                <input
                  id={nameId}
                  className="text-input text-input--large"
                  type="text"
                  value={name}
                  placeholder={t('onboarding.name.placeholder')}
                  autoComplete="nickname"
                  autoCapitalize="words"
                  spellCheck={false}
                  enterKeyHint="next"
                  maxLength={MAX_NAME_LENGTH + 20}
                  data-autofocus=""
                  autoFocus
                  aria-invalid={nameError ? 'true' : undefined}
                  aria-describedby={`${nameId}-hint`}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError(null);
                  }}
                />
                {nameError ? (
                  <p className="field-error" role="alert">
                    <Icon name="alert" size={16} />
                    <span>{errorMessage(nameError)}</span>
                  </p>
                ) : null}
              </div>
              <p id={`${nameId}-hint`} className="onboarding__hint onboarding__hint--start">
                {t('onboarding.name.hint')}
              </p>
            </div>
            <div className="onboarding__actions">
              <Button type="submit" block className="cta">
                {t('common.continue')}
              </Button>
              <Button variant="ghost" block onClick={() => submitName(undefined, true)}>
                {t('onboarding.name.skip')}
              </Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <>
            <div className="onboarding__body">
              {access.entitled ? (
                <>
                  <span className="onboarding__check" aria-hidden="true">
                    <Icon name="check" size={40} />
                  </span>
                  <h1 className="onboarding__title">{t('onboarding.account.ready')}</h1>
                </>
              ) : (
                <>
                  <h1 className="onboarding__title">{t(paywallTitleKey(access, product))}</h1>
                  <p className="onboarding__hint onboarding__hint--start">{t('onboarding.account.hint')}</p>
                  <SubscribePanel />
                </>
              )}
            </div>
            {access.entitled && (
              <div className="onboarding__actions">
                <Button block className="cta" onClick={() => setStep(3)}>
                  {t('common.continue')}
                </Button>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div className="onboarding__body onboarding__body--list">
              <h1 className="onboarding__title">{t('onboarding.currency.title')}</h1>
              <p className="onboarding__hint onboarding__hint--start">{t('onboarding.currency.hint')}</p>
              <CurrencySelector value={chosenCurrency} onSelect={chooseCurrency} suggested={suggestCurrency(deviceLocales())} />
              {currencyError ? (
                <p className="field-error" role="alert">
                  <Icon name="alert" size={16} />
                  <span>{errorMessage('currency-required')}</span>
                </p>
              ) : null}
            </div>
            <div className="onboarding__actions">
              <Button block className="cta" onClick={submitCurrency}>
                {t('common.continue')}
              </Button>
            </div>
          </>
        )}

        {step === 4 && (
          <form className="onboarding__form" onSubmit={finish} noValidate>
            <div className="onboarding__body">
              <h1 className="onboarding__title">{t('onboarding.goal.title')}</h1>
              <AmountField
                id={goalId}
                label={t('goal.amountLabel')}
                value={goalText}
                placeholder={example}
                onChange={(value) => {
                  setGoalText(value);
                  setGoalError(null);
                }}
                error={goalError ? errorMessage(goalError) : null}
                autoFocus
              />
              <div className="quick quick--wrap" role="group" aria-label={t('onboarding.goal.title')}>
                {presets.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setGoalText(amountToInput(value, currency, fmt.rawMark));
                      setGoalError(null);
                    }}
                  >
                    {fmt.money(value)}
                  </button>
                ))}
              </div>
              <p className="onboarding__hint">{t('onboarding.goal.hint')}</p>
              {failed ? (
                <p className="field-error" role="alert">
                  <Icon name="alert" size={16} />
                  <span>{errorMessage(failed)}</span>
                </p>
              ) : null}
            </div>
            <div className="onboarding__actions">
              <Button type="submit" block className="cta">
                {t('onboarding.goal.cta')}
              </Button>
              <Button variant="ghost" block onClick={() => finish(undefined, true)}>
                {t('onboarding.goal.skip')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
