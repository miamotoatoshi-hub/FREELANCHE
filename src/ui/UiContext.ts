import { createContext, useContext } from 'react';
import type { YearMonth } from '../domain/types';

export interface UiApi {
  openAddIncome: () => void;
  openEditIncome: (entryId: string) => void;
  /**
   * `month`: set the goal for one month (later months follow it).
   * `fromNow`: the Settings goal — applies from the current month on.
   */
  openGoal: (ym: YearMonth, scope: 'month' | 'fromNow') => void;
  toast: (message: string) => void;
}

export const UiContext = createContext<UiApi | null>(null);

export function useUi(): UiApi {
  const ui = useContext(UiContext);
  if (!ui) throw new Error('UiProvider is missing');
  return ui;
}
