import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { YearMonth } from '../domain/types';
import { useI18n } from '../i18n/I18nProvider';
import { useAppSelector } from '../state/context';
import { AddIncomeSheet } from './sheets/AddIncomeSheet';
import { GoalSheet } from './sheets/GoalSheet';
import { UiContext, type UiApi } from './UiContext';

type ActiveSheet =
  | { kind: 'add' }
  | { kind: 'edit'; entryId: string }
  | { kind: 'goal'; ym: YearMonth; scope: 'month' | 'fromNow' };

const TOAST_MS = 2600;

/** Owns the app-wide sheets and the toast, so any screen can open them with one call. */
export function UiProvider({ children, welcome = false }: { children: ReactNode; /** Greet the person once, right after onboarding. */ welcome?: boolean }) {
  const { t } = useI18n();
  const name = useAppSelector((s) => s.data.settings.name);
  const [sheet, setSheet] = useState<ActiveSheet | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const toastId = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message });
  }, []);

  // "Welcome, Alex!" — once, on arrival from onboarding.
  const greeted = useRef(false);
  useEffect(() => {
    if (!welcome || greeted.current) return;
    greeted.current = true;
    showToast(name ? t('greeting.welcome', { name }) : t('greeting.welcome.anon'));
  }, [welcome, name, t, showToast]);

  const api = useMemo<UiApi>(
    () => ({
      openAddIncome: () => setSheet({ kind: 'add' }),
      openEditIncome: (entryId) => setSheet({ kind: 'edit', entryId }),
      openGoal: (ym, scope) => setSheet({ kind: 'goal', ym, scope }),
      toast: showToast,
    }),
    [showToast],
  );

  const close = useCallback(() => setSheet(null), []);

  return (
    <UiContext.Provider value={api}>
      {children}
      {sheet?.kind === 'add' && <AddIncomeSheet onClose={close} />}
      {sheet?.kind === 'edit' && <AddIncomeSheet entryId={sheet.entryId} onClose={close} />}
      {sheet?.kind === 'goal' && <GoalSheet ym={sheet.ym} scope={sheet.scope} onClose={close} />}
      <div className="toasts" role="status" aria-live="polite" aria-label={t('toast.label')}>
        {toast ? (
          <div key={toast.id} className="toast">
            {toast.message}
          </div>
        ) : null}
      </div>
    </UiContext.Provider>
  );
}
