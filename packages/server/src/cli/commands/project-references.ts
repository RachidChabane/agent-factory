import { materialiseReferences, referenceFailure, ReferencesNotReadyError } from '@agent-factory/application';
import type { ProjectConfig } from '../../config/agent-factory-config.ts';
import { openReferenceSnapshots } from '../../composition/project/references.ts';
import type { CliContext } from '../cli-context.ts';

/**
 * Brings the snapshots of the projects' references up to date and says what it did to each. When a source lacks its ref
 * it refuses, listing every reference that could not be built, each with its project and the fetch that brings the ref in.
 */
export async function requireProjectReferences(context: CliContext, projects: readonly ProjectConfig[]): Promise<void> {
  const problems: string[] = [];
  for (const project of projects.filter((candidate) => candidate.references.length > 0)) {
    const snapshots = await openReferenceSnapshots(project, context.environment, context.runner);
    for (const outcome of await materialiseReferences(snapshots, project.references)) {
      if (outcome.ok) {
        const { snapshot } = outcome;
        context.output.line(`${project.id}: reference ${snapshot.name}@${snapshot.ref} ${snapshot.change} at commit ${snapshot.commit}`);
      } else {
        problems.push(`${project.id}: ${referenceFailure(outcome.reference, outcome.message)}`);
      }
    }
  }
  if (problems.length > 0) throw new ReferencesNotReadyError(problems);
}
