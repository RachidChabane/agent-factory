import { issueSubject } from '@agent-factory/domain';
import type { EventStore, GitHubGateway } from '../ports.ts';
import type { ProjectConventions } from '../conventions/project-conventions.ts';
import { parseIssueSpec } from './markdown-spec-reader.ts';

export const ISSUE_SPEC_VALIDATED_EVENT = 'issue.spec-validated';

export async function validateSpec(
  dependencies: { readonly github: GitHubGateway; readonly events: EventStore },
  issueNumber: number,
  operator: string,
  conventions: ProjectConventions,
): Promise<number> {
  const issue = await dependencies.github.getIssue(issueNumber);
  parseIssueSpec(issue, conventions);
  await dependencies.github.setLabels(issueNumber, [conventions.labels.validated], []);
  return (await dependencies.events.append(ISSUE_SPEC_VALIDATED_EVENT, issueSubject(issueNumber), { operator })).sequence;
}
