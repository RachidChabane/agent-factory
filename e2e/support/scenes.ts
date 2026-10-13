import { CommandAcceptedSchema, type AuditView, type CockpitSnapshot, type CommandBody, type CommandName, type RequestView, type RunView, type StreamEvent } from '../../packages/cockpit/src/contract/index.ts';
import { ACTIVE_PIPELINE_STATES, FEEDBACK_STATES, type AuditState } from '../../packages/domain/src/index.ts';
import { issueOf, projectOf, requestOf, runsOfIssue } from './api.ts';
import type { RunningFactory } from './factory.ts';
import { AGENT_WORK_TIMEOUT_MS } from './factory-activity.ts';
import { STOREFRONT } from './story.ts';

/** How long the factory is given to challenge a request. */
export const CHALLENGE_TIMEOUT_MS = 60_000;
const SETTLE_TIMEOUT_MS = 120_000;
/** The factory looks for changes that reached main without it once a minute, then an auditor reads the change. */
const AUDIT_TIMEOUT_MS = 240_000;
const AUDIT_UNDER_WAY: readonly AuditState[] = ['detected', 'auditing'];
const ACCEPTED_STATUS = 200;
const RECEIVED_REQUEST = /^Request (\S+) received/;
const WORKING_STATES = ACTIVE_PIPELINE_STATES.filter((state) => !FEEDBACK_STATES.includes(state));

/** What a requester wrote: the factory challenges it by its title. */
export interface RequestText {
  readonly title: string;
  readonly body: string;
}

async function send<Name extends CommandName>(factory: RunningFactory, name: Name, body: CommandBody<Name>): Promise<string> {
  const reply = await factory.api.command(name, body);
  if (reply.status !== ACCEPTED_STATUS) throw new Error(`${name} answered ${reply.status}: ${JSON.stringify(reply.body)}`);
  return CommandAcceptedSchema.parse(reply.body).effect;
}

/** Nothing of the earlier specs is still going: no agent run, no challenge, no issue between its first step and its pull request. */
export function isQuiet(state: CockpitSnapshot): boolean {
  const { running, queued } = state.installation.runSlots;
  const requests = state.projects.flatMap((project) => project.requests);
  const issues = state.projects.flatMap((project) => project.issues);
  const challenging = requests.some((request) => request.state === 'challenging');
  const working = issues.some((issue) => !issue.paused && WORKING_STATES.includes(issue.state));
  return running === 0 && queued === 0 && !challenging && !working;
}

/** Waits for the work the earlier specs started to settle, so this spec has the run slot to itself. */
export function settled(factory: RunningFactory): Promise<CockpitSnapshot> {
  return factory.api.until('the work of the earlier specs to settle', isQuiet, { timeoutMs: SETTLE_TIMEOUT_MS });
}

/** Waits for the audit of a change that reached main outside the factory: the factory notices it, then an auditor concludes. */
export async function untilAuditConcluded(factory: RunningFactory, commitSha: string): Promise<AuditView> {
  const audited = (state: CockpitSnapshot): AuditView | undefined => projectOf(state, STOREFRONT).audits.find((audit) => audit.commitSha === commitSha);
  const state = await factory.api.until(`the audit of change ${commitSha} to be concluded`, (snapshot) => {
    const audit = audited(snapshot);
    return audit !== undefined && !AUDIT_UNDER_WAY.includes(audit.state);
  }, { timeoutMs: AUDIT_TIMEOUT_MS });
  const audit = audited(state);
  if (audit === undefined) throw new Error(`the audit of change ${commitSha} vanished from the snapshot`);
  return audit;
}

/** Records a request the way the cockpit does, for the storefront unless a project is named; answers its id. */
export async function receiveRequest(factory: RunningFactory, text: RequestText, project: string = STOREFRONT): Promise<string> {
  const { installation } = await factory.api.state();
  const effect = await send(factory, 'request.create', { project, title: text.title, requester: installation.operator, body: text.body, attachments: [] });
  const id = RECEIVED_REQUEST.exec(effect)?.[1];
  if (id === undefined) throw new Error(`the factory named no request in "${effect}"`);
  return id;
}

/** Asks for the challenge of a request and waits for its report. */
export async function challengeRequest(factory: RunningFactory, requestId: string, project: string = STOREFRONT): Promise<RequestView> {
  await send(factory, 'request.challenge', { project, requestId });
  const state = await factory.api.until(`request ${requestId} to be challenged`, (snapshot) => requestOf(snapshot, project, requestId).state === 'challenged', { timeoutMs: CHALLENGE_TIMEOUT_MS });
  return requestOf(state, project, requestId);
}

export async function receiveChallengedRequest(factory: RunningFactory, text: RequestText, project: string = STOREFRONT): Promise<RequestView> {
  return challengeRequest(factory, await receiveRequest(factory, text, project), project);
}

/** Turns one proposed spec into an issue, as the cockpit's accept buttons do; answers the issue number. */
export async function acceptSpec(factory: RunningFactory, request: RequestView, specTitle: string, start: boolean, project: string = STOREFRONT): Promise<number> {
  const spec = request.challenge?.specs.find((candidate) => candidate.title === specTitle);
  if (spec === undefined) throw new Error(`request ${request.id} proposes no spec titled "${specTitle}"`);
  await send(factory, 'request.accept', { project, requestId: request.id, specIds: [spec.id], start });
  const issueNumber = requestOf(await factory.api.state(), project, request.id).challenge?.specs.find((candidate) => candidate.id === spec.id)?.issueNumber ?? null;
  if (issueNumber === null) throw new Error(`the spec "${specTitle}" of request ${request.id} has no issue after it was accepted`);
  return issueNumber;
}

/** Waits for the agents to carry the issue to its pull request, where the factory leaves it for the operator. */
export function untilPullRequestIsOpen(factory: RunningFactory, issueNumber: number, project: string = STOREFRONT): Promise<CockpitSnapshot> {
  return factory.api.until(`issue #${issueNumber} to reach its pull request`, (state) => issueOf(state, project, issueNumber).state === 'pr-open', { timeoutMs: AGENT_WORK_TIMEOUT_MS });
}

export function pauseScheduler(factory: RunningFactory): Promise<string> {
  return send(factory, 'scheduler.pause', { project: null });
}

export function resumeScheduler(factory: RunningFactory): Promise<string> {
  return send(factory, 'scheduler.resume', { project: null });
}

/** Runs the action while every agent run waits before it starts; the hold is lifted whatever the action does. */
export async function whileAgentsAreHeld<Result>(factory: RunningFactory, action: () => Promise<Result>): Promise<Result> {
  const release = await factory.holdAgents();
  try {
    return await action();
  } finally {
    await release();
  }
}

/** A run of the issue that has this status, if there is one. */
export function findRunOfIssue(state: CockpitSnapshot, issueNumber: number, status: RunView['status']): RunView | undefined {
  return runsOfIssue(state, STOREFRONT, issueNumber).find((run) => run.status === status);
}

/** The run of the issue that has this status, which the spec knows exists. */
export function runOfIssue(state: CockpitSnapshot, issueNumber: number, status: RunView['status']): RunView {
  const run = findRunOfIssue(state, issueNumber, status);
  if (run === undefined) throw new Error(`issue #${issueNumber} has no ${status} run`);
  return run;
}

/** The event of the storefront's log that is newer than the sequence and has this type and subject, if the activity feed holds it. */
export function eventAfter(state: CockpitSnapshot, sequence: number, wanted: { readonly type: string; readonly subject: string }): StreamEvent | undefined {
  return state.activity.find((event) => event.sequence > sequence && event.project === STOREFRONT && event.type === wanted.type && event.subject === wanted.subject);
}
