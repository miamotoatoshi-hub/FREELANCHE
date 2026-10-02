import { monthKey } from '../../domain/dates';
import type { MonthSummary } from '../../domain/summary';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppSelector, useMonthSummary } from '../../state/context';
import { Button } from '../components/Button';
import { GoalCard } from '../components/GoalCard';
import { Icon } from '../components/Icon';
import { IncomeAmount } from '../components/IncomeAmount';
import { IncomeChart } from '../components/IncomeChart';
import { MonthSelector } from '../components/MonthSelector';
import { ProgressRing } from '../components/ProgressRing';
import { StatCard } from '../components/StatCard';
import { useUi } from '../UiContext';

export function HomeScreen() {
  const { t } = useI18n();
  const ui = useUi();
  const summary = useMonthSummary();
  const durable = useAppSelector((s) => s.durable);
  const hasAnyEntries = useAppSelector((s) => s.data.entries.length > 0);
  const name = useAppSelector((s) => s.data.settings.name);

  const { progress, phase, entryCount } = summary;
  const showDetails = entryCount > 0 && phase !== 'future';

  return (
    <div className="screen screen--with-cta">
      <header className="topbar">
        <MonthSelector />
        <a className="icon-btn" href="#/settings" aria-label={t('nav.settings')}>
          <Icon name="settings" />
        </a>
      </header>
      <h1 className="greeting">
        {name ? t('greeting.dashboard', { name }) : t('greeting.dashboard.anon')}
      </h1>

      {!durable && (
        <p className="notice" role="note">
          {t('storage.unavailable')}
        </p>
      )}

      <div className="month-view" key={monthKey(summary.ym)} data-state={summary.appState}>
        <Hero summary={summary} hasAnyEntries={hasAnyEntries} name={name} />

        {!progress.hasGoal && (
          <GoalCard
            title={phase === 'future' ? t('home.future.goal') : t('home.noGoal.title')}
            hint={phase === 'future' ? undefined : t('home.noGoal.hint')}
            cta={t('home.noGoal.cta')}
            onSetGoal={() => ui.openGoal(summary.ym, 'month')}
          />
        )}

        <div className="cards">
          <RequiredCard summary={summary} />
          <TodayCard summary={summary} />
        </div>

        {showDetails && (
          <>
            <div className="cards">
              <StatCard
                label={t('home.dailyAverage')}
                value={<IncomeAmount value={summary.dailyAverage} size="lg" fraction="none" />}
                sub={phase === 'current' ? t('home.dailyAverage.current') : t('home.dailyAverage.past')}
              />
              <StatCard
                label={t('home.bestDay')}
                value={summary.bestDay ? <IncomeAmount value={summary.bestDay.amount} size="lg" /> : <span className="amount amount--lg">—</span>}
                sub={<BestDayDate summary={summary} />}
              />
            </div>
            <section className="card card--chart">
              <IncomeChart series={summary.series} daysInMonth={summary.daysInMonth} goal={progress.goal} />
            </section>
          </>
        )}
      </div>

      <div className="cta-bar">
        <Button block className="cta" onClick={ui.openAddIncome}>
          <Icon name="plus" size={22} />
          {t('home.add')}
        </Button>
      </div>
    </div>
  );
}

function BestDayDate({ summary }: { summary: MonthSummary }) {
  const { fmt, t } = useI18n();
  return <>{summary.bestDay ? fmt.dayMonthShort(summary.bestDay.date) : t('home.bestDay.none')}</>;
}

/** Earned this month + the goal ring. The one thing you should read in three seconds. */
function Hero({ summary, hasAnyEntries, name }: { summary: MonthSummary; hasAnyEntries: boolean; name: string }) {
  const { t, fmt } = useI18n();
  const ui = useUi();
  const { progress, phase, income, entryCount } = summary;

  const label =
    phase === 'current' ? t('home.earnedThisMonth') : t('home.earnedIn', { month: fmt.monthName(summary.ym) });

  const message =
    entryCount > 0
      ? null
      : phase === 'future'
        ? t('home.future.title')
        : phase === 'past'
          ? t('home.empty.past')
          : hasAnyEntries
            ? t('home.empty.month')
            : t('home.empty.first');

  if (!progress.hasGoal) {
    return (
      <section className="hero hero--plain" aria-label={label}>
        <p className="eyebrow">{label}</p>
        <IncomeAmount value={income} size="hero" animate />
        {message ? <p className="hero__message">{message}</p> : null}
      </section>
    );
  }

  const status = progress.exceeded
    ? t('home.overGoal', { amount: fmt.money(progress.overGoal) })
    : progress.reached
      ? t('home.goalReached')
      : phase === 'current'
        ? t('home.left', { amount: fmt.money(progress.remaining) })
        : t('home.toGoal', { amount: fmt.money(progress.remaining) });

  const showStatus = phase !== 'future';

  return (
    <section className="hero" aria-label={label}>
      <ProgressRing
        progress={progress.visualProgress}
        complete={progress.reached}
        label={t('home.ringLabel', { percent: progress.percent, earned: fmt.money(income) })}
      >
        <p className="eyebrow">{label}</p>
        <IncomeAmount value={income} size="hero" animate />
        <span className="pill">{t('home.percentOfGoal', { percent: progress.percent })}</span>
      </ProgressRing>

      {showStatus && (
        <p className={`hero__status${progress.reached ? ' is-reached' : ''}`}>
          {progress.reached && <Icon name="check" size={22} />}
          <span>{status}</span>
        </p>
      )}
      {message ? <p className="hero__message">{message}</p> : null}
      {summary.appState === 'Active' ? (
        <p className="hero__message hero__cheer">{name ? t('greeting.cheer', { name }) : t('greeting.cheer.anon')}</p>
      ) : null}

      <button type="button" className="goal-link" onClick={() => ui.openGoal(summary.ym, 'month')}>
        <span>{t('home.goalLine', { amount: fmt.money(progress.goal) })}</span>
        <Icon name="pencil" size={16} />
        <span className="sr-only">{t('home.editGoal')}</span>
      </button>
    </section>
  );
}

/** "To reach your goal €55/day" — or, once there, a calm confirmation. */
function RequiredCard({ summary }: { summary: MonthSummary }) {
  const { t, tn, fmt } = useI18n();
  const { progress, phase, requiredDaily, remainingDays } = summary;
  if (phase !== 'current' || !progress.hasGoal) return null;

  if (progress.exceeded) {
    return (
      <StatCard
        tone="success"
        label={t('home.required.title')}
        value={<span className="stat__text">{t('home.required.ahead', { amount: fmt.money(progress.overGoal) })}</span>}
      />
    );
  }
  if (progress.reached) {
    return (
      <StatCard
        tone="success"
        label={t('home.required.title')}
        value={<span className="stat__text">{t('home.required.reached')}</span>}
      />
    );
  }
  if (requiredDaily === null) return null;
  return (
    <StatCard
      tone="accent"
      label={t('home.required.title')}
      value={
        <>
          <IncomeAmount value={requiredDaily} size="lg" fraction="none" />
          <span className="stat__unit">{t('home.perDay')}</span>
        </>
      }
      sub={tn('home.required.days', remainingDays)}
    />
  );
}

/** Today's income, with yesterday alongside when it helps. */
function TodayCard({ summary }: { summary: MonthSummary }) {
  const { t, fmt } = useI18n();
  // An empty month has nothing to compare, so "Today €0" would only be noise.
  if (!summary.today || summary.entryCount === 0) return null;
  const { income, yesterday } = summary.today;
  const ahead = income > yesterday && yesterday > 0;
  return (
    <StatCard
      label={t('home.today')}
      value={<IncomeAmount value={income} size="lg" animate />}
      sub={
        yesterday > 0 ? (
          <>
            <span>{t('home.yesterdayLine', { amount: fmt.money(yesterday) })}</span>
            {ahead && <span className="stat__delta">{t('home.vsYesterday', { amount: fmt.money(income - yesterday, { signed: true }) })}</span>}
          </>
        ) : undefined
      }
    />
  );
}
