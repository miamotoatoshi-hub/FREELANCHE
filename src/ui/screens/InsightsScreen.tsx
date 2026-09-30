import { monthKey } from '../../domain/dates';
import { useI18n } from '../../i18n/I18nProvider';
import { useMonthSummary } from '../../state/context';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { IncomeAmount } from '../components/IncomeAmount';
import { MonthSelector } from '../components/MonthSelector';
import { StatCard } from '../components/StatCard';

/** A few plain-language observations. Nothing is shown that the data can't support. */
export function InsightsScreen() {
  const { t, tn, fmt } = useI18n();
  const summary = useMonthSummary();
  const { phase, previous } = summary;

  const daysLabel = phase === 'current' ? 'insights.daysWithIncome.hint.current' : 'insights.daysWithIncome.hint.past';
  const change = previous.change;

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="title">{t('insights.title')}</h1>
      </header>
      <MonthSelector />

      {summary.entryCount === 0 ? (
        <EmptyState icon="insights" title={t('insights.empty.title')} text={t('insights.empty.text')} />
      ) : (
        <div className="month-view" key={monthKey(summary.ym)}>
          <section className="card insight-total">
            <p className="eyebrow">
              {phase === 'current' ? t('insights.incomeThisMonth') : `${t('insights.income')} · ${fmt.monthYear(summary.ym)}`}
            </p>
            <IncomeAmount value={summary.income} size="xl" />
          </section>

          <section className="card compare" aria-labelledby="compare-title">
            <h2 id="compare-title" className="card__title">
              {t('insights.compare.title')}
            </h2>
            <dl className="compare__rows">
              <div>
                <dt>{fmt.monthName(summary.ym)}</dt>
                <dd>
                  <IncomeAmount value={summary.income} size="md" />
                </dd>
              </div>
              <div>
                <dt>{fmt.monthName(previous.ym)}</dt>
                <dd>
                  <IncomeAmount value={previous.income} size="md" />
                </dd>
              </div>
            </dl>
            {previous.hasData ? (
              <div className="compare__delta">
                <span className="compare__label">{t('insights.compare.difference')}</span>
                <span className="compare__values">
                  <Icon name={change.difference >= 0 ? 'arrowUp' : 'arrowDown'} size={16} />
                  <strong>{fmt.money(change.difference, { signed: true })}</strong>
                  {change.percentage !== null && <span>({fmt.percent(change.percentage, { signed: true })})</span>}
                </span>
              </div>
            ) : (
              <p className="muted">{t('insights.compare.none')}</p>
            )}
          </section>

          <div className="cards">
            <StatCard
              label={t('insights.bestDay')}
              value={summary.bestDay ? <IncomeAmount value={summary.bestDay.amount} size="lg" /> : '—'}
              sub={summary.bestDay ? fmt.dayMonth(summary.bestDay.date) : undefined}
            />
            {summary.averagePerWorkingDay !== null && (
              <StatCard
                label={t('insights.avgWorkingDay')}
                value={<IncomeAmount value={summary.averagePerWorkingDay} size="lg" fraction="none" />}
                sub={t('insights.avgWorkingDay.hint')}
              />
            )}
            <StatCard
              label={t('insights.daysWithIncome')}
              value={<span className="amount amount--lg">{`${fmt.integer(summary.daysWithIncome)} / ${fmt.integer(summary.elapsedDays)}`}</span>}
              sub={t(daysLabel, { total: summary.elapsedDays })}
            />
            {phase === 'current' && summary.streak > 0 && (
              <StatCard
                label={t('insights.streak')}
                value={<span className="amount amount--lg">{tn('insights.streak.value', summary.streak)}</span>}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
