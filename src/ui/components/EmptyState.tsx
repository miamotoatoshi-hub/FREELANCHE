import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}

/** Never leave a screen blank: say what's missing and what happens next. */
export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="empty">
      {icon ? (
        <div className="empty__icon">
          <Icon name={icon} size={28} />
        </div>
      ) : null}
      <h2 className="empty__title">{title}</h2>
      {text ? <p className="empty__text">{text}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}
