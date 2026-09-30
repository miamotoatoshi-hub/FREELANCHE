import { useId, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Icon } from './Icon';
import { Modal, useDismiss } from './Modal';

function SheetHeader({ title, titleId }: { title: string; titleId: string }) {
  const { t } = useI18n();
  const dismiss = useDismiss();
  return (
    <header className="sheet__header">
      <h2 id={titleId} className="sheet__title">
        {title}
      </h2>
      <button type="button" className="icon-btn" aria-label={t('sheet.close')} onClick={dismiss}>
        <Icon name="close" />
      </button>
    </header>
  );
}

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A bottom sheet with a title and close button. */
export function Sheet({ title, onClose, children }: SheetProps) {
  const titleId = useId();
  return (
    <Modal variant="sheet" titleId={titleId} onClose={onClose}>
      <div className="sheet__grabber" aria-hidden="true" />
      <SheetHeader title={title} titleId={titleId} />
      <div className="sheet__body">{children}</div>
    </Modal>
  );
}
