import { FACTORY_LABEL } from '@agent-factory/domain';
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

export const AUDIT_LABEL = 'audit';
export const AUDIT_ISSUE_LABELS: readonly string[] = [AUDIT_LABEL, FACTORY_LABEL];

export interface PublishAuditIssueDependencies {
  readonly events: EventStore;
  readonly github: GitHubGateway;
}

export async function publishAuditIssue(dependencies: PublishAuditIssueDependencies, auditId: string): Promise<number> {
  const { events, github } = dependencies;
  const audit = await loadAudit(events, auditId);
  if (audit === null) throw new AuditNotFoundError(auditId);
  if (audit.publishedIssueNumber !== null) return audit.publishedIssueNumber;
  if (audit.draft === null) throw new AuditIssueNotDraftedError(auditId);

  const issue = await github.createIssue(audit.draft.title, audit.draft.body, AUDIT_ISSUE_LABELS);
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
