import type { CockpitSnapshot, InstallationInfo, InstallationSettingsView, ProjectView, RunView } from '../../contract/index.ts';

/** The snapshot with one project replaced by what `update` makes of it; the other projects are shared, not copied. */
export function mapProject(snapshot: CockpitSnapshot, projectId: string, update: (project: ProjectView) => ProjectView): CockpitSnapshot {
  if (!snapshot.projects.some((project) => project.id === projectId)) throw new Error(`the snapshot has no project ${projectId}`);
  return { ...snapshot, projects: snapshot.projects.map((project) => (project.id === projectId ? update(project) : project)) };
}

export function mapRuns(snapshot: CockpitSnapshot, update: (runs: readonly RunView[]) => RunView[]): CockpitSnapshot {
  return { ...snapshot, runs: update(snapshot.runs) };
}

/** The snapshot with the configuration file in the state given, the rest of the installation settings unchanged. */
export function withConfiguration(snapshot: CockpitSnapshot, configuration: Partial<InstallationSettingsView['configuration']>): CockpitSnapshot {
  return { ...snapshot, settings: { ...snapshot.settings, configuration: { ...snapshot.settings.configuration, ...configuration } } };
}

/** The snapshot with some facts of the installation replaced, for example its mode or its pauses. */
export function withInstallation(snapshot: CockpitSnapshot, patch: Partial<InstallationInfo>): CockpitSnapshot {
  return { ...snapshot, installation: { ...snapshot.installation, ...patch } };
}
