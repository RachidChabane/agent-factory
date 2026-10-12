import { assertRequestTransition, issueSubject } from '@agent-factory/domain';
import type { ProjectConventions } from '../conventions/project-conventions.ts';
import type { EventStore, GitHubGateway, IssueRecord, WorkspaceFiles } from '../ports.ts';
import { ISSUE_CREATED_EVENT, type IssueCreatedPayload } from '../spec/issue-events.ts';
import { parseSpecFile, specFileLabels, specFileProblems, type SpecFile } from '../spec/spec-file.ts';
import { filmScenarioProblem } from '../spec/spec-format.ts';
import { RequestNotFoundError } from './errors.ts';
import { renderSpecFile, type ProposedSpecDraft } from './proposed-spec-file.ts';
import {
  REQUEST_DECLINED_EVENT,
  REQUEST_ISSUE_CREATED_EVENT,
  REQUEST_SPEC_UPDATED_EVENT,
  requestSubject,
  type ProposedSpecPayload,
} from './request-events.ts';
import { FILE_PATH_SEPARATOR } from './request-files.ts';
import { loadRequest, loadRequests, type RequestRecord } from './request-projection.ts';

const DECLINED = 'declined';

export class ProposedSpecNotFoundError extends Error {
  constructor(requestId: string, specId: string) {
    super(`request ${requestId} has no proposed spec ${specId}`);
    this.name = 'ProposedSpecNotFoundError';
  }
}

export class SpecFileRefusedError extends Error {
  constructor(detail: string) {
    super(`The spec file cannot become an issue: ${detail}`);
    this.name = 'SpecFileRefusedError';
  }
}

export interface SpecOrigin {
  readonly requestId: string;
  readonly specId: string;
}

export interface IssueCreationPlan {
  readonly title: string;
  readonly labels: readonly string[];
  /** The film scenarios the spec declares, also present as film labels in `labels`. */
  readonly films: readonly string[];
  readonly body: string;
  readonly origin: SpecOrigin | null;
}

async function requireRequest(events: EventStore, requestId: string): Promise<RequestRecord> {
  const request = await loadRequest(events, requestId);
  if (request === null) throw new RequestNotFoundError(requestId);
  return request;
}

function requireSpec(request: RequestRecord, specId: string): ProposedSpecPayload {
  const spec = request.challenge?.specs.find((candidate) => candidate.id === specId);
  if (spec === undefined) throw new ProposedSpecNotFoundError(request.id, specId);
  return spec;
}

export async function declineRequest(events: EventStore, requestId: string, reason: string): Promise<number> {
  const request = await requireRequest(events, requestId);
  assertRequestTransition(request.state, DECLINED);
  return (await events.append(REQUEST_DECLINED_EVENT, requestSubject(requestId), { reason })).sequence;
}

export interface RequestDecisionSettings {
  readonly requestsDirectory: string;
  readonly conventions: ProjectConventions;
}

export async function updateProposedSpec(
  dependencies: { readonly events: EventStore; readonly files: WorkspaceFiles },
  settings: RequestDecisionSettings,
  requestId: string,
  specId: string,
  draft: ProposedSpecDraft,
): Promise<number> {
  const request = await requireRequest(dependencies.events, requestId);
  const current = requireSpec(request, specId);
  const rendered = renderSpecFile(draft, settings.conventions);
  await dependencies.files.writeText(`${settings.requestsDirectory}${FILE_PATH_SEPARATOR}${requestId}`, current.path, rendered.content);
  const spec: ProposedSpecPayload = {
    ...current,
    title: draft.title,
    type: draft.type,
    need: draft.need,
    acceptanceCriteria: [...draft.acceptanceCriteria],
    outOfScope: [...draft.outOfScope],
    expectedProof: draft.expectedProof,
    problems: [...rendered.problems],
  };
  return (await dependencies.events.append(REQUEST_SPEC_UPDATED_EVENT, requestSubject(requestId), { specId, spec })).sequence;
}

export async function specOriginOf(events: EventStore, requestsDirectory: string, specPath: string): Promise<SpecOrigin | null> {
  const prefix = `${requestsDirectory}${FILE_PATH_SEPARATOR}`;
  if (!specPath.startsWith(prefix)) return null;
  const [requestId, ...rest] = specPath.slice(prefix.length).split(FILE_PATH_SEPARATOR);
  const relative = rest.join(FILE_PATH_SEPARATOR);
  const request = (await loadRequests(events)).find((candidate) => candidate.id === requestId);
  const spec = request?.challenge?.specs.find((candidate) => candidate.path === relative);
  return request === undefined || spec === undefined ? null : { requestId: request.id, specId: spec.id };
}

export function planIssueCreation(text: string, origin: SpecOrigin | null, conventions: ProjectConventions): IssueCreationPlan {
  const file: SpecFile = parseSpecFile(text);
  const { validated } = conventions.labels;
  if (file.labels.includes(validated)) {
    throw new SpecFileRefusedError(`it carries ${validated}; only the operator adds that label, on the created issue`);
  }
  for (const scenario of file.films) {
    const refusal = filmScenarioProblem(scenario);
    if (refusal !== null) throw new SpecFileRefusedError(`Films: "${scenario}" is refused: ${refusal}`);
  }
  const problems = specFileProblems(file, conventions);
  if (problems.length > 0) throw new SpecFileRefusedError(problems.map((problem) => problem.message).join('; '));
  return { title: file.title, labels: [...new Set([conventions.labels.factory, ...specFileLabels(file)])], films: file.films, body: file.body, origin };
}

export async function createIssueFromPlan(
  dependencies: { readonly events: EventStore; readonly github: GitHubGateway },
  plan: IssueCreationPlan,
): Promise<IssueRecord> {
  const issue = await dependencies.github.createIssue(plan.title, plan.body, plan.labels);
  const created: IssueCreatedPayload = { title: issue.title, labels: [...issue.labels], requestId: plan.origin?.requestId ?? null, specId: plan.origin?.specId ?? null };
  await dependencies.events.append(ISSUE_CREATED_EVENT, issueSubject(issue.number), created);
  if (plan.origin !== null) {
    await dependencies.events.append(REQUEST_ISSUE_CREATED_EVENT, requestSubject(plan.origin.requestId), {
      specId: plan.origin.specId,
      issueNumber: issue.number,
    });
  }
  return issue;
}

export async function acceptProposedSpecs(
  dependencies: { readonly events: EventStore; readonly github: GitHubGateway; readonly files: WorkspaceFiles },
  settings: RequestDecisionSettings,
  requestId: string,
  specIds: readonly string[],
): Promise<readonly IssueRecord[]> {
  const request = await requireRequest(dependencies.events, requestId);
  const root = `${settings.requestsDirectory}${FILE_PATH_SEPARATOR}${requestId}`;
  const created: IssueRecord[] = [];
  for (const specId of specIds) {
    if (request.createdIssues[specId] !== undefined) continue;
    const spec = requireSpec(request, specId);
    const text = await dependencies.files.readText(root, spec.path);
    if (text === null) throw new SpecFileRefusedError(`${spec.path} no longer exists`);
    created.push(await createIssueFromPlan(dependencies, planIssueCreation(text, { requestId, specId }, settings.conventions)));
  }
  return created;
}
