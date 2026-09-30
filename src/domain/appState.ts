import type { MonthPhase } from './dates';
import type { GoalProgress } from './calculations';
import type { AppState } from './types';

export interface AppStateInput {
  loadFailed: boolean;
  onboardingCompleted: boolean;
  phase: MonthPhase;
  /** Entries in the selected month. */
  entryCount: number;
  progress: GoalProgress;
}

/**
 * One label for "what situation is the dashboard in", chosen by a strict
 * priority so contradictory states (e.g. empty *and* goal reached) cannot occur.
 */
export function deriveAppState(input: AppStateInput): AppState {
  if (input.loadFailed) return 'Error';
  if (!input.onboardingCompleted) return 'FirstLaunch';
  if (input.phase === 'future') return 'FutureMonth';
  if (input.phase === 'past') return 'HistoricalMonth';
  if (input.entryCount === 0) return 'Empty';
  if (!input.progress.hasGoal) return 'NoGoal';
  if (input.progress.exceeded) return 'GoalExceeded';
  if (input.progress.reached) return 'GoalReached';
  return 'Active';
}
