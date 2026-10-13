import type { PauseView, UsageView } from '@agent-factory/cockpit';
import type { FilmToolWait, RestartHazard } from '@agent-factory/application';
import { ISSUE_STATES, type IssueState } from '@agent-factory/domain';
import { renderCalm } from './calm-view.ts';
import { readingTime } from './time-text.ts';
import { renderUsage } from './usage-view.ts';

const PAUSE_INDENT = '  ';
const PROJECT_DETAIL_INDENT = '    ';
const WAIT_DETAIL_INDENT = '  ';

export interface ProjectOverview {
  readonly id: string;
  readonly name: string;
  readonly forge: string;
  readonly issuesByState: ReadonlyMap<IssueState, number>;
  readonly pauses: readonly PauseView[];
  /** The tool its films wait for; null when they wait for none. */
  readonly filmToolWait: FilmToolWait | null;
}

export interface InstallationOverview {
  readonly home: string;
  readonly configPath: string;
  /** The process of the running factory, or null when none runs. */
  readonly factoryProcess: number | null;
  readonly cockpitUrl: string;
  /** What a restart would cut short; only a running factory has any. */
  readonly hazards: readonly RestartHazard[];
  readonly maxConcurrentRuns: number;
  readonly pauses: readonly PauseView[];
  readonly usage: UsageView;
  readonly projects: readonly ProjectOverview[];
}

function issuesLine(issuesByState: ReadonlyMap<IssueState, number>): string {
  const counts = ISSUE_STATES.flatMap((state) => {
    const count = issuesByState.get(state) ?? 0;
    return count === 0 ? [] : [`${count} ${state}`];
  });
  return counts.length === 0 ? 'no issue taken by the factory yet' : counts.join(', ');
}

function pauseLine(pause: PauseView, now: Date, indent: string): string {
  const resumes = pause.resumesAt === null ? '' : `, resumes ${pause.resumesAt}`;
  return `${indent}paused (${pause.cause}) since ${readingTime(pause.since, now)}${resumes}: ${pause.reason}`;
}

function recoveryText(wait: FilmToolWait): string {
  if (wait.loginCommand !== null) return `; log in with: ${wait.loginCommand}`;
  return wait.fixCommand === null ? '' : `; fix with: ${wait.fixCommand}`;
}

function filmToolWaitLines(wait: FilmToolWait, now: Date): readonly string[] {
  const detail = wait.detail === '' ? '' : `: ${wait.detail}`;
  return [
    `${PROJECT_DETAIL_INDENT}films wait for the tool ${wait.tool} (${wait.status}${detail})`,
    `${PROJECT_DETAIL_INDENT}${WAIT_DETAIL_INDENT}since ${readingTime(wait.since.toISOString(), now)}, checked ${readingTime(wait.checkedAt.toISOString(), now)}${recoveryText(wait)}`,
  ];
}

function projectLines(project: ProjectOverview, now: Date): readonly string[] {
  return [
    `  ${project.id} (${project.name}) on ${project.forge}`,
    ...project.pauses.map((pause) => pauseLine(pause, now, PROJECT_DETAIL_INDENT)),
    ...(project.filmToolWait === null ? [] : filmToolWaitLines(project.filmToolWait, now)),
    `${PROJECT_DETAIL_INDENT}${issuesLine(project.issuesByState)}`,
  ];
}

export function renderOverview(overview: InstallationOverview, now: Date): readonly string[] {
  const factory = overview.factoryProcess === null ? 'not running' : `running as process ${overview.factoryProcess}, cockpit at ${overview.cockpitUrl}`;
  return [
    `Installation ${overview.home} (configuration ${overview.configPath})`,
    `Factory: ${factory}`,
    ...renderCalm(overview.factoryProcess !== null, overview.hazards, now),
    `Agent runs at a time: at most ${overview.maxConcurrentRuns}`,
    overview.pauses.length === 0 ? 'Pauses: none' : 'Pauses:',
    ...overview.pauses.map((pause) => pauseLine(pause, now, PAUSE_INDENT)),
    '',
    ...renderUsage(overview.usage, now),
    '',
    'Projects:',
    ...overview.projects.flatMap((project) => projectLines(project, now)),
  ];
}
