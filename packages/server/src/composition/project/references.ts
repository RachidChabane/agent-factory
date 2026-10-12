import { GitReferenceSnapshots, type ReferenceMount, type ReferenceMounts } from '@agent-factory/adapters';
import { referenceSnapshotPath, type CommandRunner, type ReferenceSnapshots } from '@agent-factory/application';
import type { ProjectConfig } from '../../config/agent-factory-config.ts';
import { projectGitEnvironment } from './forge.ts';
import type { SourceEnvironment } from './project-settings.ts';

/** The project's snapshots, in the references directory of the project; git runs on the local clones only, never on a network. */
export function openReferenceSnapshots(project: ProjectConfig, environment: SourceEnvironment, runner: CommandRunner): Promise<GitReferenceSnapshots> {
  return GitReferenceSnapshots.open(runner, { directory: project.directories.references, environment: projectGitEnvironment(project, environment) });
}

/** The snapshots of the project that are built, as its agents' runs see them, read again for every run. */
export function referenceMounts(project: ProjectConfig, snapshots: ReferenceSnapshots): ReferenceMounts {
  return async () => {
    const mounts = await Promise.all(
      project.references.map(async (reference): Promise<readonly ReferenceMount[]> => {
        const stored = await snapshots.inspect(reference);
        return stored.commit === null ? [] : [{ name: reference.name, repository: reference.repository, ref: reference.ref, commit: stored.commit, path: stored.path }];
      }),
    );
    return mounts.flat();
  };
}

/** Where the snapshots of the project's references are, built or not, which confined commands may read and never write. */
export function referenceSnapshotDirectories(project: ProjectConfig): readonly string[] {
  return project.references.map((reference) => referenceSnapshotPath(project.directories.references, reference));
}
