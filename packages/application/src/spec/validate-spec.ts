import { issueSubject } from '@agent-factory/domain';
import type { EventStore, GitHubGateway } from '../ports.ts';
import { parseIssueSpec } from './markdown-spec-reader.ts';
import { SPEC_VALIDATED_LABEL } from './spec-format.ts';

export const ISSUE_SPEC_VALIDATED_EVENT = 'issue.spec-validated';

export async function validateSpec(
  dependencies: { readonly github: GitHubGateway; readonly events: EventStore },
  issueNumber: number,
  operator: string,
): Promise<number> {
  const issue = await dependencies.github.getIssue(issueNumber);
  parseIssueSpec(issue);
  await dependencies.github.setLabels(issueNumber, [SPEC_VALIDATED_LABEL], []);
  return (await dependencies.events.append(ISSUE_SPEC_VALIDATED_EVENT, issueSubject(issueNumber), { operator })).sequence;
}
