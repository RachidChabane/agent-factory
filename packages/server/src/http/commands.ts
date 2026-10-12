import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { COMMAND_BODY_SCHEMAS, type CommandBody, type CommandName } from '@agent-factory/cockpit';
import {
  AbandonIssue,
  acceptProposedSpecs,
  AddRequest,
  checkTool,
  declineRequest,
  detectedRelease,
  loadJournal,
  MergeOnOrder,
  OrderCheckRewrite,
  pauseScheduling,
  publishAuditIssue,
  PullRequestFeedback,
  requestChallenge,
  requestDrain,
  requestOnDemandAudit,
  resolveAudit,
  resumeScheduling,
  RUN_STARTED_EVENT,
  RunStartedPayloadSchema,
  runSubject,
  setIssuePaused,
  updateProposedSpec,
  validateSpec,
  type EventStore,
} from '@agent-factory/application';
import { ISSUE_ESCALATION_STATE, type SettingsChange } from '@agent-factory/domain';
import type { InstallationRuntime } from '../composition/installation/installation-runtime.ts';
import type { RunningDaemons } from '../composition/installation-daemon.ts';
import type { ProjectRuntime } from '../composition/project/project-runtime.ts';
import {
  environmentRedeployer,
  issueResumer,
  releaseCutter,
  releaseEvaluator,
  requestDecisionSettings,
} from '../composition/project/project-use-cases.ts';
import { DECISION_QUESTION_PREFIX } from '../projections/run-views.ts';
import type { SequenceCursor } from './sequence-cursor.ts';

export const UNKNOWN_COMMAND = 'unknown-command';
export const COCKPIT_CHANNEL = 'cockpit';
const INCOMING_DIRECTORY = '.incoming';
const DATA_URL = /^data:([^;,]+)?(;base64)?,(.*)$/s;
const BASE64 = 'base64';
const UTF8 = 'utf8';
const FIRST_SEQUENCE = 0;
const ISSUE_SUBJECT_KIND = 'issue';
const OPERATOR_CAUSE = 'operator';
const HTTP = { ok: 200, badRequest: 400, notFound: 404, conflict: 409 } as const;
const LIST_SEPARATOR = ', ';

export interface CommandContext {
  readonly runtime: InstallationRuntime;
  /** The running daemons, or null when the command comes from outside a running factory. */
  readonly daemons: RunningDaemons | null;
  readonly operator: string;
}

export interface CommandResponse {
  readonly status: number;
  readonly body: { readonly sequence: number | null; readonly effect: string } | { readonly error: string; readonly command?: string };
}

export class CommandRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandRefusedError';
  }
}

/** What a handler did, in the operator's words. */
type Effect = string;
type Handler = (raw: unknown, context: CommandContext) => Promise<Effect>;

function command<B>(schema: z.ZodType<B>, handler: (body: B, context: CommandContext) => Promise<Effect>): Handler {
  return async (raw, context) => handler(schema.parse(raw), context);
}

function projectOf(context: CommandContext, id: string): ProjectRuntime {
  return context.runtime.project(id);
}

function startedByDaemon(context: CommandContext, what: string): string {
  return context.daemons === null ? `${what}; start the factory to run it` : `${what}; the daemon picks it up at its next tick`;
}

async function decodeAttachments(directory: string, attachments: CommandBody<'request.create'>['attachments']): Promise<void> {
  await mkdir(directory, { recursive: true });
  for (const attachment of attachments) {
    const match = DATA_URL.exec(attachment.dataUrl);
    if (match === null) throw new CommandRefusedError(`attachment ${attachment.name} is not a data URL`);
    const data = match[3] ?? '';
    const bytes = match[2] === undefined ? Buffer.from(decodeURIComponent(data), UTF8) : Buffer.from(data, BASE64);
    await writeFile(join(directory, attachment.name.replaceAll('/', '_')), bytes);
  }
}

interface RunOwner {
  readonly project: ProjectRuntime;
  readonly subject: { readonly kind: string; readonly id: string };
}

/** Runs are recorded in the installation's log; their record names the project they work for. */
async function runOwner(context: CommandContext, runId: string): Promise<RunOwner> {
  const subject = runSubject(runId);
  const started = (await context.runtime.events.read(subject, FIRST_SEQUENCE)).find((record) => record.subject === subject && record.type === RUN_STARTED_EVENT);
  if (started === undefined) throw new CommandRefusedError(`run ${runId} is unknown`);
  const payload = RunStartedPayloadSchema.parse(started.payload);
  if (payload.project === null) throw new CommandRefusedError(`run ${runId} belongs to no project`);
  return { project: projectOf(context, payload.project), subject: payload.subject };
}

function requireDaemons(context: CommandContext): RunningDaemons {
  if (context.daemons === null) throw new CommandRefusedError('the factory is not running; start it with "agent-factory start"');
  return context.daemons;
}

function stopIssue(context: CommandContext, project: ProjectRuntime, issueNumber: number): boolean {
  return context.daemons?.project(project.id)?.stopIssue(issueNumber) ?? false;
}

async function changeSettings(context: CommandContext, change: SettingsChange): Promise<Effect> {
  const { runtime, daemons, operator } = context;
  await runtime.changeSettings(change, operator);
  const reload = await runtime.live.reload();
  for (const [project, concurrency] of reload.concurrencyByProject) daemons?.project(project)?.updateConcurrency(concurrency);
  const saved = `saved to ${runtime.config.configPath}`;
  return reload.restartRequired.length === 0 ? `Settings ${saved} and applied` : `Settings ${saved}; ${reload.restartRequired.join(LIST_SEPARATOR)} apply after a restart`;
}

function scopeEvents(context: CommandContext, project: string | null): { readonly events: EventStore; readonly label: string } {
  if (project === null) return { events: context.runtime.events, label: 'every project' };
  return { events: projectOf(context, project).dependencies.events, label: project };
}

export const COMMAND_HANDLERS: Readonly<Record<CommandName, Handler>> = {
  'request.create': command(COMMAND_BODY_SCHEMAS['request.create'], async (body, context) => {
    const project = projectOf(context, body.project);
    const requestsDirectory = project.config.directories.requests;
    const incoming = join(requestsDirectory, INCOMING_DIRECTORY, randomUUID());
    try {
      await decodeAttachments(incoming, body.attachments);
      const added = await new AddRequest({ events: project.dependencies.events, files: project.dependencies.files, clock: context.runtime.clock }, { requestsDirectory }).add({
        title: body.title,
        requester: body.requester,
        channel: COCKPIT_CHANNEL,
        body: body.body,
        images: body.attachments.map((attachment) => ({ name: attachment.name.replaceAll('/', '_'), sourceDirectory: incoming })),
      });
      return `Request ${added.id} received for ${project.id} with ${added.attachments.length} attachment(s)`;
    } finally {
      await rm(incoming, { recursive: true, force: true });
    }
  }),
  'request.challenge': command(COMMAND_BODY_SCHEMAS['request.challenge'], async (body, context) => {
    await requestChallenge(projectOf(context, body.project).dependencies.events, body.requestId, context.operator);
    return startedByDaemon(context, `The challenge of request ${body.requestId} is queued`);
  }),
  'request.decline': command(COMMAND_BODY_SCHEMAS['request.decline'], async (body, context) => {
    await declineRequest(projectOf(context, body.project).dependencies.events, body.requestId, body.reason);
    return `Request ${body.requestId} declined`;
  }),
  'request.update-spec': command(COMMAND_BODY_SCHEMAS['request.update-spec'], async (body, context) => {
    const project = projectOf(context, body.project);
    await updateProposedSpec(project.dependencies, requestDecisionSettings(project), body.requestId, body.specId, body.spec);
    return `Proposed spec ${body.specId} of request ${body.requestId} saved`;
  }),
  'request.accept': command(COMMAND_BODY_SCHEMAS['request.accept'], async (body, context) => {
    const project = projectOf(context, body.project);
    const created = await acceptProposedSpecs(project.dependencies, requestDecisionSettings(project), body.requestId, body.specIds);
    if (created.length === 0) return 'Every accepted spec already had its issue';
    const numbers = created.map((issue) => `#${issue.number}`).join(LIST_SEPARATOR);
    if (!body.start) return `Issue(s) ${numbers} created on ${project.id}; validate their specs to let the factory take them`;
    for (const issue of created) await validateSpec(project.dependencies, issue.number, context.operator, project.conventions);
    return startedByDaemon(context, `Issue(s) ${numbers} created on ${project.id} and validated`);
  }),
  'issue.validate-spec': command(COMMAND_BODY_SCHEMAS['issue.validate-spec'], async (body, context) => {
    const project = projectOf(context, body.project);
    await validateSpec(project.dependencies, body.issueNumber, context.operator, project.conventions);
    return startedByDaemon(context, `The spec of issue #${body.issueNumber} is validated and labelled ${project.conventions.labels.validated}`);
  }),
  'issue.start': command(COMMAND_BODY_SCHEMAS['issue.start'], async (body, context) => {
    await setIssuePaused(projectOf(context, body.project).dependencies.events, body.issueNumber, false, `started by ${context.operator}`);
    return startedByDaemon(context, `Issue #${body.issueNumber} may start`);
  }),
  'issue.pause': command(COMMAND_BODY_SCHEMAS['issue.pause'], async (body, context) => {
    const project = projectOf(context, body.project);
    await setIssuePaused(project.dependencies.events, body.issueNumber, true, `paused by ${context.operator}`);
    return stopIssue(context, project, body.issueNumber) ? `Issue #${body.issueNumber} paused and its agent run stopped` : `Issue #${body.issueNumber} paused; nothing was running`;
  }),
  'issue.resume': command(COMMAND_BODY_SCHEMAS['issue.resume'], async (body, context) => {
    const project = projectOf(context, body.project);
    const journal = await loadJournal(project.dependencies.events, body.issueNumber);
    const resumedAt = journal.state === ISSUE_ESCALATION_STATE ? (await issueResumer(project).resume(body.issueNumber)).resumedAt : null;
    await setIssuePaused(project.dependencies.events, body.issueNumber, false, `resumed by ${context.operator}`);
    return startedByDaemon(context, resumedAt === null ? `Issue #${body.issueNumber} resumed` : `Issue #${body.issueNumber} resumed at ${resumedAt}`);
  }),
  'issue.abandon': command(COMMAND_BODY_SCHEMAS['issue.abandon'], async (body, context) => {
    const project = projectOf(context, body.project);
    stopIssue(context, project, body.issueNumber);
    const outcome = await new AbandonIssue(project.dependencies).abandon({ issueNumber: body.issueNumber, operator: context.operator, reason: body.reason });
    const worktree = outcome.releasedWorktree === null ? '' : '; its worktree was released';
    const pullRequest = outcome.openPullRequest === null ? '' : `; pull request #${outcome.openPullRequest} stays open for the operator to close`;
    return `Issue #${body.issueNumber} abandoned${worktree}${pullRequest}`;
  }),
  'issue.rewrite-check': command(COMMAND_BODY_SCHEMAS['issue.rewrite-check'], async (body, context) => {
    const project = projectOf(context, body.project);
    const { events, states } = project.dependencies;
    const ordered = await new OrderCheckRewrite({ events, states, clock: context.runtime.clock }).order({
      issueNumber: body.issueNumber,
      path: body.path,
      instruction: body.instruction,
      operator: context.operator,
    });
    if (ordered.driven) stopIssue(context, project, body.issueNumber);
    return startedByDaemon(context, `A rewrite of ${body.path} is ordered on issue #${body.issueNumber}`);
  }),
  'run.stop': command(COMMAND_BODY_SCHEMAS['run.stop'], async (body, context) => {
    const daemons = requireDaemons(context);
    const { project, subject } = await runOwner(context, body.runId);
    if (subject.kind === ISSUE_SUBJECT_KIND) {
      await setIssuePaused(project.dependencies.events, Number(subject.id), true, `run ${body.runId} stopped by ${context.operator}`);
      daemons.project(project.id)?.stopIssue(Number(subject.id));
      return `Run ${body.runId} stopped and issue #${subject.id} paused`;
    }
    if (daemons.project(project.id)?.stopBackground() !== true) throw new CommandRefusedError(`run ${body.runId} is not running`);
    return `Run ${body.runId} stopped`;
  }),
  'run.resume': command(COMMAND_BODY_SCHEMAS['run.resume'], async (body, context) => {
    const { project, subject } = await runOwner(context, body.runId);
    if (subject.kind !== ISSUE_SUBJECT_KIND) throw new CommandRefusedError(`a ${subject.kind} run resumes by asking for it again`);
    await setIssuePaused(project.dependencies.events, Number(subject.id), false, `run ${body.runId} resumed by ${context.operator}`);
    return startedByDaemon(context, `Issue #${subject.id} may run again`);
  }),
  'run.answer': command(COMMAND_BODY_SCHEMAS['run.answer'], async (body, context) => {
    const { project, subject } = await runOwner(context, body.runId);
    if (subject.kind !== ISSUE_SUBJECT_KIND) throw new CommandRefusedError(`a ${subject.kind} run asks no question`);
    if (body.questionId !== `${DECISION_QUESTION_PREFIX}${body.runId}`) {
      throw new CommandRefusedError(`question ${body.questionId} does not belong to run ${body.runId}`);
    }
    const outcome = await issueResumer(project).resume(Number(subject.id), body.answer);
    return startedByDaemon(context, `The answer is recorded and issue #${subject.id} resumes at ${outcome.resumedAt}`);
  }),
  'pr.merge': command(COMMAND_BODY_SCHEMAS['pr.merge'], async (body, context) => {
    const outcome = await new MergeOnOrder(projectOf(context, body.project).dependencies).merge({ pullRequestNumber: body.number, expectedHeadSha: body.expectedHeadSha });
    return `Pull request #${outcome.pullRequestNumber} merged as ${outcome.mergeSha.slice(0, 7)}`;
  }),
  'pr.feedback': command(COMMAND_BODY_SCHEMAS['pr.feedback'], async (body, context) => {
    const project = projectOf(context, body.project);
    const outcome = await new PullRequestFeedback({ ...project.dependencies, clock: context.runtime.clock }, project.settings.implementerEscalation).record({
      pullRequestNumber: body.number,
      author: body.author,
      source: COCKPIT_CHANNEL,
      body: body.body,
    });
    return outcome.kind === 'cycle-started'
      ? startedByDaemon(context, `Feedback recorded; issue #${outcome.issueNumber} starts attempt ${outcome.attempt}`)
      : `Feedback recorded; issue #${outcome.issueNumber} needs a human: ${outcome.reason}`;
  }),
  'deployment.redeploy': command(COMMAND_BODY_SCHEMAS['deployment.redeploy'], async (body, context) => {
    const outcome = await environmentRedeployer(projectOf(context, body.project)).redeploy({ environment: body.environment, confirmVersion: body.confirmVersion, operator: context.operator });
    return `${outcome.workflow} dispatched on ${outcome.ref} to redeploy ${outcome.version} to ${outcome.environment}${outcome.simulated ? ' (simulated by the local forge)' : ''}`;
  }),
  'release.cut': command(COMMAND_BODY_SCHEMAS['release.cut'], async (body, context) => {
    const cut = await releaseCutter(projectOf(context, body.project)).cut({ releaseId: body.releaseId, operator: context.operator });
    return `Release ${cut.releaseId} cut: pull request #${cut.pullRequestNumber} merged as ${cut.mergeSha.slice(0, 7)}`;
  }),
  'release.evaluate': command(COMMAND_BODY_SCHEMAS['release.evaluate'], async (body, context) => {
    const project = projectOf(context, body.project);
    const evaluation = await releaseEvaluator(project).evaluate(await detectedRelease(project.dependencies.events, body.releaseId));
    return evaluation.promotable ? `Release ${body.releaseId} is promotable` : `Release ${body.releaseId} is blocked: ${evaluation.blockingReasons.join('; ')}`;
  }),
  'audit.request': command(COMMAND_BODY_SCHEMAS['audit.request'], async (body, context) => {
    const project = projectOf(context, body.project);
    const requested = await requestOnDemandAudit(project.dependencies, body.commitSha);
    return requested.alreadyRecorded ? `Change ${requested.auditId.slice(0, 7)} already has an audit` : startedByDaemon(context, `An audit of ${requested.auditId.slice(0, 7)} is queued`);
  }),
  'audit.publish-issue': command(COMMAND_BODY_SCHEMAS['audit.publish-issue'], async (body, context) => {
    const project = projectOf(context, body.project);
    const issueNumber = await publishAuditIssue(project.dependencies, project.conventions, body.auditId);
    return `Issue #${issueNumber} opened from the audit of ${body.auditId.slice(0, 7)}`;
  }),
  'audit.resolve': command(COMMAND_BODY_SCHEMAS['audit.resolve'], async (body, context) => {
    await resolveAudit(projectOf(context, body.project).dependencies.events, body.auditId, body.note);
    return `The audit of ${body.auditId.slice(0, 7)} is resolved`;
  }),
  'scheduler.pause': command(COMMAND_BODY_SCHEMAS['scheduler.pause'], async (body, context) => {
    const scope = scopeEvents(context, body.project);
    await pauseScheduling(scope.events, OPERATOR_CAUSE, `paused by ${context.operator}`, null);
    return `No new work starts for ${scope.label}; running issues finish their current step`;
  }),
  'factory.drain': command(COMMAND_BODY_SCHEMAS['factory.drain'], async (_body, context) => {
    const daemons = requireDaemons(context);
    await requestDrain(context.runtime.events, context.operator);
    const running = context.runtime.projects.reduce((count, project) => count + (daemons.project(project.id)?.runningIssues().length ?? 0), 0);
    return running === 0 ? 'No new work starts; the factory stops at its next tick' : `No new work starts; the factory stops once its ${running} running issue(s) finish`;
  }),
  'scheduler.resume': command(COMMAND_BODY_SCHEMAS['scheduler.resume'], async (body, context) => {
    const scope = scopeEvents(context, body.project);
    await resumeScheduling(scope.events, OPERATOR_CAUSE);
    return startedByDaemon(context, `Scheduling resumed for ${scope.label}`);
  }),
  'usage.refresh': command(COMMAND_BODY_SCHEMAS['usage.refresh'], async (_body, context) => {
    const usage = await context.runtime.usage.refreshNow(new AbortController().signal);
    return `Subscription usage read for ${usage.length} account(s)`;
  }),
  'tools.check': command(COMMAND_BODY_SCHEMAS['tools.check'], async (body, context) => {
    const { runtime, operator } = context;
    const result =
      body.project === null
        ? await checkTool(runtime.events, runtime.tools, body.tool, operator)
        : await checkTool(projectOf(context, body.project).dependencies.events, runtime.projectTools(body.project), body.tool, operator);
    return `${result.tool}: ${result.status}${result.version === null ? '' : ` (${result.version})`}`;
  }),
  'health.check': command(COMMAND_BODY_SCHEMAS['health.check'], async (body, context) => {
    const samples = await projectOf(context, body.project).health.sampleEnvironment(body.environment);
    return `${samples} health check(s) of ${body.environment} sampled`;
  }),
  'settings.update-role': command(COMMAND_BODY_SCHEMAS['settings.update-role'], (body, context) =>
    changeSettings(context, { kind: 'role', project: body.project, ...body.change }),
  ),
  'settings.update-resources': command(COMMAND_BODY_SCHEMAS['settings.update-resources'], (body, context) =>
    changeSettings(context, { kind: 'resources', ...body }),
  ),
  'settings.update-budget': command(COMMAND_BODY_SCHEMAS['settings.update-budget'], (body, context) =>
    changeSettings(context, {
      kind: 'budget',
      dailyCap: body.dailyCapUsd === null ? { kind: 'none' } : { kind: 'usd', amount: body.dailyCapUsd },
      perRunCapUsd: body.perRunCapUsd,
    }),
  ),
  'settings.update-concurrency': command(COMMAND_BODY_SCHEMAS['settings.update-concurrency'], (body, context) =>
    changeSettings(context, { kind: 'concurrency', project: body.project, issues: body.issues, ceiling: body.ceiling }),
  ),
};

function isCommandName(name: string): name is CommandName {
  return Object.hasOwn(COMMAND_BODY_SCHEMAS, name);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function dispatchCommand(name: string, raw: unknown, context: CommandContext, cursor: SequenceCursor): Promise<CommandResponse> {
  if (!isCommandName(name)) return { status: HTTP.notFound, body: { error: UNKNOWN_COMMAND, command: name } };
  const handler = COMMAND_HANDLERS[name];
  const before = await cursor.latest();
  let effect: Effect;
  try {
    effect = await handler(raw, context);
  } catch (error) {
    if (error instanceof z.ZodError) return { status: HTTP.badRequest, body: { error: `invalid body: ${z.prettifyError(error)}`, command: name } };
    return { status: HTTP.conflict, body: { error: errorText(error), command: name } };
  }
  const after = await cursor.latest();
  return { status: HTTP.ok, body: { sequence: after > before ? after : null, effect } };
}
