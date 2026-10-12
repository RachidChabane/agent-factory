import type { ProjectConventions } from '../conventions/project-conventions.ts';
import type { EventStore, GitHubGateway } from '../ports.ts';
import { loadAudit } from './audit-projection.ts';
import { AuditIssueNotDraftedError, AuditNotFoundError } from './errors.ts';
import {
  AUDIT_ISSUE_PUBLISHED_EVENT,
  AUDIT_RESOLVED_EVENT,
  auditSubject,
  type AuditIssuePublishedPayload,
  type AuditResolvedPayload,
} from './events.ts';

export interface PublishAuditIssueDependencies {
  readonly events: EventStore;
  readonly github: GitHubGateway;
}

export function auditIssueLabels(conventions: ProjectConventions): readonly string[] {
  return [conventions.labels.audit, conventions.labels.factory];
}

export async function publishAuditIssue(dependencies: PublishAuditIssueDependencies, conventions: ProjectConventions, auditId: string): Promise<number> {
  const { events, github } = dependencies;
  const audit = await loadAudit(events, auditId);
  if (audit === null) throw new AuditNotFoundError(auditId);
  if (audit.publishedIssueNumber !== null) return audit.publishedIssueNumber;
  if (audit.draft === null) throw new AuditIssueNotDraftedError(auditId);

  const issue = await github.createIssue(audit.draft.title, audit.draft.body, auditIssueLabels(conventions));
  const published: AuditIssuePublishedPayload = { issueNumber: issue.number };
  await events.append(AUDIT_ISSUE_PUBLISHED_EVENT, auditSubject(auditId), published);
  return issue.number;
}

export async function resolveAudit(events: EventStore, auditId: string, note: string): Promise<void> {
  const audit = await loadAudit(events, auditId);
  if (audit === null) throw new AuditNotFoundError(auditId);
  if (audit.resolved) return;
  const resolved: AuditResolvedPayload = { note };
  await events.append(AUDIT_RESOLVED_EVENT, auditSubject(auditId), resolved);
}
