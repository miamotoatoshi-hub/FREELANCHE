import { useId, useState, type FormEvent } from 'react';
import type { ErrorCode } from '../../domain/types';
import { MAX_NAME_LENGTH } from '../../domain/validation';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppSelector, useAppStore } from '../../state/context';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useDismiss } from '../components/Modal';
import { Sheet } from '../components/Sheet';
import { useErrorMessage } from '../hooks/useErrorMessage';
import { useUi } from '../UiContext';

export function NameSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet title={t('nameSheet.title')} onClose={onClose}>
      <NameForm />
    </Sheet>
  );
}

function NameForm() {
  const { t } = useI18n();
  const store = useAppStore();
  const ui = useUi();
  const dismiss = useDismiss();
  const errorMessage = useErrorMessage();
  const id = useId();
  const saved = useAppSelector((s) => s.data.settings.name);
  const [text, setText] = useState(saved);
  const [error, setError] = useState<ErrorCode | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = store.setName(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    ui.toast(t('settings.saved'));
    dismiss();
  };

  return (
    <form className="income-form" onSubmit={submit} noValidate>
      <p className="sheet__hint">{t('nameSheet.hint')}</p>
      <div className="field">
        <label className="field__label" htmlFor={id}>
          {t('name.label')}
        </label>
        <input
          id={id}
          className="text-input"
          type="text"
          value={text}
          placeholder={t('onboarding.name.placeholder')}
          autoComplete="nickname"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={MAX_NAME_LENGTH + 20}
          data-autofocus=""
          aria-invalid={error ? 'true' : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
        />
        {error ? (
          <p className="field-error" role="alert">
            <Icon name="alert" size={16} />
            <span>{errorMessage(error)}</span>
          </p>
        ) : null}
      </div>
      <Button type="submit" block className="income-form__submit">
        {t('nameSheet.save')}
      </Button>
    </form>
  );
}
