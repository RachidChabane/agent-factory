import { DETERMINISTIC_PIPELINE_STATES, type AgentRole, type IssueState } from '@agent-factory/domain';
import type { FilmRunningStage } from '../pipeline/journal-events.ts';
import type { FactoryEventRecord } from '../ports.ts';
import { RunStartedPayloadSchema } from '../runs/run-events.ts';
import { openRunStartsIn } from '../runs/orphan-runs.ts';
import { issueJournalsOf } from './held-worktrees.ts';
import { pausedIssuesIn } from './issue-pause.ts';

/** What a restart would cut short while the factory runs. */
export type RestartHazard =
  | { readonly kind: 'agent-run'; readonly project: string | null; readonly role: AgentRole; readonly subject: string; readonly startedAt: Date }
  | { readonly kind: 'film-recording'; readonly project: string; readonly issueNumber: number; readonly scenario: string; readonly stage: FilmRunningStage | null }
  | { readonly kind: 'deterministic-stage'; readonly project: string; readonly issueNumber: number; readonly state: IssueState };

export interface RestartWorld {
  /** The installation's own records, where the agent runs of every project are kept. */
  readonly installation: readonly FactoryEventRecord[];
  /** The records of each project, as the project sees them. */
  readonly projects: ReadonlyMap<string, readonly FactoryEventRecord[]>;
}

function agentRuns(records: readonly FactoryEventRecord[]): readonly RestartHazard[] {
  return openRunStartsIn(records).flatMap((record): RestartHazard[] => {
    const started = RunStartedPayloadSchema.safeParse(record.payload);
    if (!started.success) return [];
    const { project, role, subject, startedAt } = started.data;
    return [{ kind: 'agent-run', project, role, subject: `${subject.kind} ${subject.id}`, startedAt: new Date(startedAt) }];
  });
}

function projectHazards(project: string, records: readonly FactoryEventRecord[]): readonly RestartHazard[] {
  const paused = pausedIssuesIn(records);
  return [...issueJournalsOf(records).values()]
    .toSorted((left, right) => left.issueNumber - right.issueNumber)
    .flatMap((journal): RestartHazard[] => {
      const recordings = journal.filmOrders
        .filter((order) => order.status === 'running')
        .map((order): RestartHazard => ({ kind: 'film-recording', project, issueNumber: journal.issueNumber, scenario: order.scenario, stage: order.stage }));
      const state = journal.state;
      const working = state !== null && DETERMINISTIC_PIPELINE_STATES.includes(state) && !paused.has(journal.issueNumber);
      return [...recordings, ...(working ? [{ kind: 'deterministic-stage' as const, project, issueNumber: journal.issueNumber, state }] : [])];
    });
}

/**
 * What a restart would cut short in a factory that runs: the agent runs open, the films recording, and the issues
 * the factory itself works on (freezing the checks, the gate, the evidence) that nobody paused. A moment with none
 * of these is calm: the drain ends at once.
 */
export function restartHazards(world: RestartWorld): readonly RestartHazard[] {
  return [...agentRuns(world.installation), ...[...world.projects].flatMap(([project, records]) => projectHazards(project, records))];
}
