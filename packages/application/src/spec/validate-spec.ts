import { issueSubject } from '@agent-factory/domain';
import { delegationFields, type Delegation } from '../autonomy/delegation.ts';
import type { EventStore, GitHubGateway } from '../ports.ts';
import type { ProjectConventions } from '../conventions/project-conventions.ts';
import { ISSUE_SPEC_VALIDATED_EVENT } from './issue-events.ts';
import { parseIssueSpec } from './markdown-spec-reader.ts';

/** Validates the spec of an issue: the operator's gesture, or the delegate's when `delegation` names it. */
export async function validateSpec(
  dependencies: { readonly github: Pick<GitHubGateway, 'getIssue' | 'setLabels'>; readonly events: EventStore },
  issueNumber: number,
  operator: string,
  conventions: ProjectConventions,
  delegation: Delegation | null = null,
): Promise<number> {
  const issue = await dependencies.github.getIssue(issueNumber);
  parseIssueSpec(issue, conventions);
  await dependencies.github.setLabels(issueNumber, [conventions.labels.validated], []);
  return (await dependencies.events.append(ISSUE_SPEC_VALIDATED_EVENT, issueSubject(issueNumber), { operator, ...delegationFields(delegation) })).sequence;
}
