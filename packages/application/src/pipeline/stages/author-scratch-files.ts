import type { IssueSpec } from '@agent-factory/domain';
import {
  checkPaths,
  declaredOutputPaths,
  EVIDENCE_PREFIX,
  FACTORY_WORK_DIRECTORY,
  isSafeRelativePath,
  type AcceptanceManifest,
} from '../../acceptance/acceptance-manifest.ts';
import type { Worktree } from '../../ports.ts';
import { PIPELINE_EVENTS } from '../journal-events.ts';
import type { StageContext } from './stage.ts';
import { issueTypeOfSpec } from './stage-support.ts';

const FACTORY_WORK_PREFIX = `${FACTORY_WORK_DIRECTORY}/`;
const PROTECTED_PREFIXES: readonly string[] = [FACTORY_WORK_PREFIX, EVIDENCE_PREFIX];

function isScratch(path: string, kept: ReadonlySet<string>): boolean {
  return isSafeRelativePath(path) && !kept.has(path) && !PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Deletes the files the acceptance author created and the manifest does not account for, such as a probe it
 * ran while exploring, and records them. A change to a file the base holds is not scratch: it stays, and the
 * check that only the declared checks changed escalates it.
 */
export async function removeAuthorScratchFiles(context: StageContext, worktree: Worktree, spec: IssueSpec, manifest: AcceptanceManifest): Promise<void> {
  const { dependencies } = context.toolkit;
  const kept = new Set([...checkPaths(manifest), ...declaredOutputPaths(manifest, issueTypeOfSpec(context, spec))]);
  const scratch = (await dependencies.sourceControl.untrackedFiles(worktree)).filter((path) => isScratch(path, kept));
  if (scratch.length === 0) return;
  for (const path of scratch) await dependencies.files.remove(worktree.path, path);
  await context.writer.record(PIPELINE_EVENTS.authorScratchFilesRemoved, { paths: scratch });
}
