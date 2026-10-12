import type { IssueSpec, IssueTypeDefinition } from '@agent-factory/domain';
import { checkPaths, EVIDENCE_DIRECTORY, type AcceptanceManifest } from '../../acceptance/acceptance-manifest.ts';
import type { Worktree } from '../../ports.ts';
import { diffStat, type DiffStatEntry } from '../diff-stat.ts';
import { EscalationRequiredError } from '../pipeline-errors.ts';
import type { CheckContent } from '../role-prompts.ts';
import type { FrozenRecord } from '../journal-events.ts';
import type { StageContext } from './stage.ts';
import type { PipelineRole, RoleProfile } from '../pipeline-settings.ts';

const EVIDENCE_PREFIX = `${EVIDENCE_DIRECTORY}/`;
const MISSING_CONTENT = '';

export async function assertOnlyChecksChanged(
  context: StageContext,
  worktree: Worktree,
  manifest: AcceptanceManifest,
  situation: string,
): Promise<void> {
  const allowed = checkPaths(manifest);
  const changed = await context.toolkit.dependencies.sourceControl.changedFiles(worktree);
  const extras = changed.filter((path) => !allowed.includes(path));
  if (extras.length > 0) throw new EscalationRequiredError(`${situation}: ${extras.join(', ')}`);
}

export async function readCheckContents(context: StageContext, worktree: Worktree, frozen: FrozenRecord): Promise<readonly CheckContent[]> {
  return Promise.all(
    frozen.checks.map(async (check) => ({
      path: check.path,
      content: (await context.toolkit.dependencies.files.readText(worktree.path, check.path)) ?? MISSING_CONTENT,
    })),
  );
}

export function changeStat(diff: string): readonly DiffStatEntry[] {
  return diffStat(diff).filter((entry) => !entry.path.startsWith(EVIDENCE_PREFIX));
}

export function issueTypeOfSpec(context: StageContext, spec: IssueSpec): IssueTypeDefinition {
  return context.toolkit.settings.conventions.typology.get(spec.type);
}

export function profileOf(context: StageContext, role: PipelineRole): RoleProfile {
  return context.toolkit.settings.roles[role];
}
