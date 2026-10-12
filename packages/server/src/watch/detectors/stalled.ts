import type { IssueState } from '@agent-factory/domain';
import { BLOCKER_KINDS, blockerKey, type Blocker, type BlockerDetector } from '../blocker.ts';
import { MILLISECONDS_PER_MINUTE } from '../time-units.ts';
import { isProjectPaused, runsOfIssue } from './snapshot-queries.ts';

/** The stages of the pipeline in which an agent run is expected; the others run the factory's own commands. */
const AGENT_STAGES: readonly IssueState[] = ['authoring-checks', 'rewriting-check', 'implementing', 'reviewing'];
const LIVE_RUN_STATUSES: readonly string[] = ['running', 'waiting'];

/**
 * An issue in a stage that owes an agent run, with no run live and nothing recorded for it for the
 * threshold. A pause of the issue, of its project or of the factory explains the silence.
 */
export const stalledDetector: BlockerDetector = {
  kind: BLOCKER_KINDS.stalled,
  detect: (snapshot, { now, thresholds }) =>
    snapshot.projects.flatMap((project) => {
      if (isProjectPaused(snapshot, project)) return [];
      return project.issues.flatMap((issue): Blocker[] => {
        if (!AGENT_STAGES.includes(issue.state) || issue.paused) return [];
        const runs = runsOfIssue(snapshot, project.id, issue.number);
        if (runs.some((run) => LIVE_RUN_STATUSES.includes(run.status))) return [];
        const activity = Math.max(new Date(issue.updatedAt).getTime(), ...runs.map((run) => new Date(run.endedAt ?? run.startedAt).getTime()));
        const silentMs = now.getTime() - activity;
        if (silentMs <= thresholds.silenceMs) return [];
        return [
          {
            key: blockerKey(BLOCKER_KINDS.stalled, project.id, issue.number),
            kind: BLOCKER_KINDS.stalled,
            project: project.id,
            issue: issue.number,
            detail: `in ${issue.state} for ${Math.floor(silentMs / MILLISECONDS_PER_MINUTE)} min with no agent run`,
          },
        ];
      });
    }),
};
