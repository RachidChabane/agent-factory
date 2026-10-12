import type { CockpitSnapshot, PauseView } from '../../packages/cockpit/src/contract/index.ts';
import { ACTIVE_PIPELINE_STATES } from '../../packages/domain/src/index.ts';

const IN_PROGRESS_RUN_STATUSES: readonly string[] = ['running', 'waiting'];
const NOTHING = 'none';

function describePauses(pauses: readonly PauseView[]): string {
  return pauses.length === 0 ? NOTHING : pauses.map((pause) => `${pause.cause} (${pause.scope})`).join(', ');
}

/** What the factory is doing right now, for the message of a wait that ran out: the slots, the pauses, the work in progress. */
export function describeActivity(state: CockpitSnapshot): string {
  const { runSlots, pauses } = state.installation;
  const lines = [`run slots: ${runSlots.running} running, ${runSlots.queued} queued, ${runSlots.limit} at most`, `installation pauses: ${describePauses(pauses)}`];
  for (const project of state.projects) {
    if (project.pauses.length > 0) lines.push(`${project.id} pauses: ${describePauses(project.pauses)}`);
    for (const issue of project.issues) {
      if (!ACTIVE_PIPELINE_STATES.includes(issue.state) && !issue.paused) continue;
      const blockedBy = issue.dependsOn.length === 0 ? '' : `, blocked by ${issue.dependsOn.map((number) => `#${number}`).join(' ')}`;
      lines.push(`${project.id} issue #${issue.number}: ${issue.state}${issue.paused ? ', paused' : ''}${blockedBy}`);
    }
  }
  for (const run of state.runs.filter((candidate) => IN_PROGRESS_RUN_STATUSES.includes(candidate.status))) {
    lines.push(`run ${run.id}: ${run.role} ${run.status} on ${run.subject.kind} ${run.subject.id}`);
  }
  return lines.join('\n');
}
