import { useCallback, useSyncExternalStore } from 'react';

export type Route = 'home' | 'history' | 'insights' | 'settings';

export const ROUTES: readonly Route[] = ['home', 'history', 'insights', 'settings'];

const toHash = (route: Route) => (route === 'home' ? '#/' : `#/${route}`);

function parse(hash: string): Route {
  const name = hash.replace(/^#\/?/, '');
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'home';
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

/** Tiny hash router — enough for four tabs, gives real back-button behaviour and deep links. */
export function useHashRoute(): [Route, (route: Route) => void] {
  const route = useSyncExternalStore(
    subscribe,
    () => parse(window.location.hash),
    () => 'home' as Route,
  );
  const navigate = useCallback((next: Route) => {
    if (parse(window.location.hash) !== next) window.location.hash = toHash(next);
  }, []);
  return [route, navigate];
}
