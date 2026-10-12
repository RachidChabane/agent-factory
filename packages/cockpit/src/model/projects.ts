import type { CockpitSnapshot, ProjectView, RunView } from '../contract/index.ts';

export const LIVE_RUN_STATUSES: readonly RunView['status'][] = ['running', 'waiting'];

export function isLiveRun(run: Pick<RunView, 'status'>): boolean {
  return LIVE_RUN_STATUSES.includes(run.status);
}

export function findProject(snapshot: Pick<CockpitSnapshot, 'projects'>, id: string): ProjectView | null {
  return snapshot.projects.find((project) => project.id === id) ?? null;
}

export function projectName(snapshot: Pick<CockpitSnapshot, 'projects'>, id: string | null): string | null {
  return id === null ? null : (findProject(snapshot, id)?.name ?? id);
}

/** The runs of a project, or every run of the installation when no project is given. */
export function runsOf(snapshot: Pick<CockpitSnapshot, 'runs'>, project: string | null): readonly RunView[] {
  return project === null ? snapshot.runs : snapshot.runs.filter((run) => run.project === project);
}

export function liveRunsOf(snapshot: Pick<CockpitSnapshot, 'runs'>, project: string | null): readonly RunView[] {
  return runsOf(snapshot, project).filter(isLiveRun);
}
