import { touchesAny, type CommitKind, type IssueSpec } from '@agent-factory/domain';
import type { ProjectConventions } from '../conventions/project-conventions.ts';

export const CHECKS_COMMIT_TYPE = 'test';
const TRAILING_PERIODS = /[.\s]+$/;
export const EVIDENCE_COMMIT_TYPE = 'chore';
export const EVIDENCE_COMMIT_SCOPE = 'evidence';

/**
 * A `kind:` label on the issue wins; otherwise the first path rule of the issue type that the
 * change touches; otherwise the type's own commit type.
 */
export function commitKindFor(spec: IssueSpec, conventions: ProjectConventions, changedPaths: readonly string[] = []): CommitKind {
  if (spec.commitKind !== null) return spec.commitKind;
  const commit = conventions.typology.get(spec.type).commit;
  return commit.whenChanged.find((rule) => touchesAny(changedPaths, rule.paths))?.type ?? commit.type;
}

export function scopeFor(spec: IssueSpec, conventions: ProjectConventions): string {
  return conventions.typology.get(spec.type).commit.scope ?? conventions.defaultScope;
}

export function conventionalHeader(type: string, scope: string, subject: string): string {
  return `${type}(${scope}): ${subject}`;
}

export function conventionalSubject(title: string): string {
  const subject = title.trim().replace(TRAILING_PERIODS, '');
  return `${subject.charAt(0).toLowerCase()}${subject.slice(1)}`;
}

export function pullRequestTitle(spec: IssueSpec, conventions: ProjectConventions, changedPaths: readonly string[] = []): string {
  return conventionalHeader(commitKindFor(spec, conventions, changedPaths), scopeFor(spec, conventions), conventionalSubject(spec.title));
}

export function checksCommitMessage(spec: IssueSpec, conventions: ProjectConventions): string {
  return conventionalHeader(CHECKS_COMMIT_TYPE, scopeFor(spec, conventions), `add acceptance checks for #${spec.number}`);
}

export function checkRewriteCommitMessage(spec: IssueSpec, conventions: ProjectConventions, path: string): string {
  return conventionalHeader(CHECKS_COMMIT_TYPE, scopeFor(spec, conventions), `rewrite the acceptance check ${path} for #${spec.number}`);
}

export function implementationCommitMessage(spec: IssueSpec, conventions: ProjectConventions, changedPaths: readonly string[] = []): string {
  return `${pullRequestTitle(spec, conventions, changedPaths)}\n\nRefs #${spec.number}`;
}

export function evidenceCommitMessage(spec: IssueSpec): string {
  return conventionalHeader(EVIDENCE_COMMIT_TYPE, EVIDENCE_COMMIT_SCOPE, `add proof for #${spec.number}`);
}

export function evidenceRemovalCommitMessage(issueNumber: number): string {
  return conventionalHeader(EVIDENCE_COMMIT_TYPE, EVIDENCE_COMMIT_SCOPE, `remove proof of #${issueNumber} before merge`);
}
