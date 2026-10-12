import type { AgentRole, EffortLevel } from '@agent-factory/domain';
import type { AgentRunOutcome, RunStatus, RunSubject } from '../../contract/index.ts';

export const LOGGED_RUN_SCRIPTS = ['status-filter-implementer', 'promo-savings-decision', 'expired-promo-implementer', 'search-second-review'] as const;
export type LoggedRunScript = (typeof LOGGED_RUN_SCRIPTS)[number];

/** How a run that has no log gets its number of turns. */
export type TurnsRule = 'by-duration' | 'turn-limit' | 'budget-limit';

export interface PendingQuestionSpec {
  readonly id: string;
  readonly text: string;
  readonly options: readonly string[];
}

/** What the world knows of one run before its numbers are worked out. */
export interface RunSpec {
  readonly id: string;
  readonly project: string | null;
  readonly role: AgentRole;
  readonly subject: RunSubject;
  readonly attempt: number;
  readonly branch: string | null;
  readonly account: string | null;
  readonly startedMinutesAgo: number;
  /** Null while the run is going. */
  readonly durationMinutes: number | null;
  readonly status: RunStatus;
  readonly outcome: AgentRunOutcome | null;
  readonly model?: string;
  readonly effort?: EffortLevel;
  /** The cache a resumed session starts from; a fresh session starts small. */
  readonly resumed?: boolean;
  readonly turns?: TurnsRule;
  readonly script?: LoggedRunScript;
  readonly question?: PendingQuestionSpec;
}
