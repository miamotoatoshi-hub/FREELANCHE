import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { EntitlementSnapshot, EntitlementStore } from './store';

const EntitlementContext = createContext<EntitlementStore | null>(null);

export function EntitlementProvider({ store, children }: { store: EntitlementStore; children: ReactNode }) {
  return <EntitlementContext.Provider value={store}>{children}</EntitlementContext.Provider>;
}

export function useEntitlementStore(): EntitlementStore {
  const store = useContext(EntitlementContext);
  if (!store) throw new Error('EntitlementProvider is missing');
  return store;
}

/** The current subscription state. Re-renders whenever it changes. */
export function useEntitlement(): EntitlementSnapshot {
  const store = useEntitlementStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
