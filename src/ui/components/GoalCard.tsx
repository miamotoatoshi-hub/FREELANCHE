import { Button } from './Button';

interface GoalCardProps {
  title: string;
  hint?: string;
  cta: string;
  onSetGoal: () => void;
}

/** A calm prompt to set a goal — optional, never blocking. */
export function GoalCard({ title, hint, cta, onSetGoal }: GoalCardProps) {
  return (
    <div className="card goal-card">
      <div className="goal-card__text">
        <h2 className="goal-card__title">{title}</h2>
        {hint ? <p className="goal-card__hint">{hint}</p> : null}
      </div>
      <Button variant="secondary" onClick={onSetGoal}>
        {cta}
      </Button>
    </div>
  );
}
