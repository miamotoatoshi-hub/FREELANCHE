import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'accent' | 'success';
  className?: string;
}

/** A compact label / value / hint card. Used for every secondary number. */
export function StatCard({ label, value, sub, tone = 'default', className = '' }: StatCardProps) {
  return (
    <div className={`stat stat--${tone} ${className}`.trim()}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {sub ? <div className="stat__sub">{sub}</div> : null}
    </div>
  );
}
