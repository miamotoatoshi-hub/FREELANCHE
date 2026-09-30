import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Icon } from './Icon';

interface EntryMenuProps {
  /** Accessible name for the "⋯" button, e.g. "More actions for €250". */
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}

/** The unobtrusive overflow menu on each entry: Edit / Delete. */
export function EntryMenu({ label, onEdit, onDelete }: EntryMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="more" />
      </button>
      {open ? (
        <div className="menu__list" id={menuId} role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu__item"
            onClick={() => {
              close(false);
              onEdit();
            }}
          >
            <Icon name="pencil" size={18} />
            {t('history.edit')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu__item menu__item--danger"
            onClick={() => {
              close(false);
              onDelete();
            }}
          >
            <Icon name="trash" size={18} />
            {t('history.delete')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
