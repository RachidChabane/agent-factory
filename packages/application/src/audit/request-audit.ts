import { ON_DEMAND_AUDIT_REASON } from '@agent-factory/domain';
import type { EventStore, GitHubGateway } from '../ports.ts';
import { loadAudit } from './audit-projection.ts';
import { AUDIT_DETECTED_EVENT, auditSubject, type AuditDetectedPayload } from './events.ts';

export interface OnDemandAuditDependencies {
  readonly events: EventStore;
  readonly github: GitHubGateway;
}

export interface RequestedAudit {
  readonly auditId: string;
  readonly alreadyRecorded: boolean;
}

export async function requestOnDemandAudit(dependencies: OnDemandAuditDependencies, sha: string): Promise<RequestedAudit> {
  const { events, github } = dependencies;
  const commit = await github.commit(sha);
  if ((await loadAudit(events, commit.sha)) !== null) return { auditId: commit.sha, alreadyRecorded: true };
  const payload: AuditDetectedPayload = {
    commitSha: commit.sha,
    reason: ON_DEMAND_AUDIT_REASON,
    commitMessage: commit.message,
    authorLogin: commit.authorLogin,
    pullRequestNumber: commit.pullRequestNumber,
  };
  await events.append(AUDIT_DETECTED_EVENT, auditSubject(commit.sha), payload);
  return { auditId: commit.sha, alreadyRecorded: false };
}
