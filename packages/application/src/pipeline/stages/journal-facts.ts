import type { IssueSpec } from '@agent-factory/domain';
import type { AcceptanceManifest } from '../../acceptance/acceptance-manifest.ts';
import type { Worktree } from '../../ports.ts';
import { MissingJournalFactError, WorktreeUnavailableError } from '../pipeline-errors.ts';
import type { BeforeProofRecord, FrozenRecord } from '../journal-events.ts';
import type { PipelineJournal } from '../pipeline-journal.ts';
import type { StageContext } from './stage.ts';

export function requireFact<T>(journal: PipelineJournal, value: T | null, fact: string): T {
  if (value === null) throw new MissingJournalFactError(journal.issueNumber, fact);
  return value;
}

export function requireSpec(journal: PipelineJournal): IssueSpec {
  return requireFact(journal, journal.spec, 'spec');
}

export function requireManifest(journal: PipelineJournal): AcceptanceManifest {
  return requireFact(journal, journal.manifest, 'acceptance manifest');
}

export function requireFrozen(journal: PipelineJournal): FrozenRecord {
  return requireFact(journal, journal.frozen, 'frozen checks');
}

export function requireBeforeProof(journal: PipelineJournal): BeforeProofRecord {
  return requireFact(journal, journal.beforeProof, 'before proof');
}

export function requireBranch(journal: PipelineJournal): string {
  return requireFact(journal, journal.branch, 'branch');
}

export async function leasedWorktree(context: StageContext): Promise<Worktree> {
  const { journal } = context;
  const recorded = requireFact(journal, journal.worktree, 'worktree');
  const knownCommit = journal.lastCommitSha ?? recorded.baseSha;
  const worktree = await context.toolkit.dependencies.pool.reattach(journal.issueNumber, recorded, knownCommit);
  if (worktree === null) throw new WorktreeUnavailableError(recorded.path);
  return worktree;
}
