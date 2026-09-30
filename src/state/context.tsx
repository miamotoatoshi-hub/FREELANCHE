import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { buildMonthSummary, type MonthSummary } from '../domain/summary';
import type { AppStore, AppSnapshot } from './store';

const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreProvider is missing');
  return store;
}

/**
 * Subscribes to one slice of the store. The selector must return a stable
 * value (a field of the snapshot, not a freshly built object) so components
 * only re-render when their slice really changes.
 */
export function useAppSelector<T>(selector: (snapshot: AppSnapshot) => T): T {
  const store = useAppStore();
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()));
}

/** Every derived number for the selected month, recomputed only when its inputs change. */
export function useMonthSummary(): MonthSummary {
  const data = useAppSelector((s) => s.data);
  const ym = useAppSelector((s) => s.selectedMonth);
  const today = useAppSelector((s) => s.today);
  const status = useAppSelector((s) => s.status);
  return useMemo(
    () => buildMonthSummary({ data, ym, today, loadFailed: status === 'error' }),
    [data, ym, today, status],
  );
}
