import { useId, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Button } from './Button';
import { Modal, useDismiss } from './Modal';

interface ConfirmationDialogProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

function Actions({ confirmLabel, cancelLabel, tone, onConfirm }: Pick<ConfirmationDialogProps, 'confirmLabel' | 'cancelLabel' | 'tone' | 'onConfirm'>) {
  const { t } = useI18n();
  const dismiss = useDismiss();
  return (
    <div className="dialog__actions">
      {/* Cancel gets focus first: a destructive action is never the default. */}
      <Button variant="secondary" block data-autofocus onClick={dismiss}>
        {cancelLabel ?? t('common.cancel')}
      </Button>
      <Button variant={tone === 'danger' ? 'danger' : 'primary'} block onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </div>
  );
}

export function ConfirmationDialog({ title, description, confirmLabel, cancelLabel, tone = 'default', onConfirm, onCancel }: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Modal variant="dialog" role="alertdialog" titleId={titleId} describedBy={descriptionId} onClose={onCancel}>
      <h2 id={titleId} className="dialog__title">
        {title}
      </h2>
      <div id={descriptionId} className="dialog__text">
        {description}
      </div>
      <Actions confirmLabel={confirmLabel} cancelLabel={cancelLabel} tone={tone} onConfirm={onConfirm} />
    </Modal>
  );
}
