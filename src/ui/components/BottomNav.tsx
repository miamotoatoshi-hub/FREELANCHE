import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { ROUTES, type Route } from '../hooks/useHashRoute';
import { Icon, type IconName } from './Icon';

const ITEMS: Record<Route, { icon: IconName; label: MessageKey; href: string }> = {
  home: { icon: 'home', label: 'nav.home', href: '#/' },
  history: { icon: 'history', label: 'nav.history', href: '#/history' },
  insights: { icon: 'insights', label: 'nav.insights', href: '#/insights' },
  settings: { icon: 'settings', label: 'nav.settings', href: '#/settings' },
};

export function BottomNav({ route }: { route: Route }) {
  const { t } = useI18n();
  return (
    <nav className="tabbar" aria-label={t('nav.label')}>
      {ROUTES.map((name) => {
        const item = ITEMS[name];
        const active = name === route;
        return (
          <a key={name} href={item.href} className={`tabbar__item${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon name={item.icon} />
            <span>{t(item.label)}</span>
          </a>
        );
      })}
    </nav>
  );
}
