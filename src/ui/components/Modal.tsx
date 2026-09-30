import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

const DismissContext = createContext<() => void>(() => undefined);

/** Closes the surrounding modal with its exit animation. */
export const useDismiss = () => useContext(DismissContext);

const LEAVE_MS = 180;
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let openModals = 0;

function lockPage() {
  openModals += 1;
  if (openModals === 1) {
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'hidden';
  }
}

function unlockPage() {
  openModals = Math.max(0, openModals - 1);
  if (openModals === 0) {
    const root = document.getElementById('root');
    root?.removeAttribute('inert');
    root?.removeAttribute('aria-hidden');
    document.body.style.overflow = '';
  }
}

interface ModalProps {
  variant: 'sheet' | 'dialog';
  role?: 'dialog' | 'alertdialog';
  /** id of the element that titles the modal. */
  titleId: string;
  describedBy?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Accessible modal surface: portal, focus moves in and is trapped, Escape and
 * backdrop dismiss, background is inert, focus returns to where it came from.
 * Put `data-autofocus` on the element that should receive focus first.
 */
export function Modal({ variant, role = 'dialog', titleId, describedBy, onClose, children }: ModalProps) {
  const [leaving, setLeaving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const dismiss = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (prefersReducedMotion()) {
      onCloseRef.current();
      return;
    }
    setLeaving(true);
    window.setTimeout(() => onCloseRef.current(), LEAVE_MS);
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    lockPage();
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus({ preventScroll: true });
    return () => {
      unlockPage();
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  // Keep a sheet above the on-screen keyboard where the browser doesn't resize the layout.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (variant !== 'sheet' || !viewport) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      wrapperRef.current?.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [variant]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      dismiss();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      ref={wrapperRef}
      className={`modal modal--${variant}${leaving ? ' is-leaving' : ''}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        ref={panelRef}
        className="modal__panel"
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <DismissContext.Provider value={dismiss}>{children}</DismissContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
