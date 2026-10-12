import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { COMMAND_BODY_SCHEMAS, type CommandBody, type CommandName } from '@agent-factory/cockpit';
import {
  AbandonIssue,
  acceptProposedSpecs,
  attributionRules,
  AddRequest,
  ChangeSettings,
  checkTool,
  CutRelease,
  declineRequest,
  detectedRelease,
  evaluateRelease,
  loadJournal,
  MergeOnOrder,
  OrderCheckRewrite,
  pauseScheduling,
  publishAuditIssue,
  RedeployEnvironment,
  PullRequestFeedback,
  requestChallenge,
  resolveAudit,
  resumeScheduling,
  ResumeIssue,
  type RequestDecisionSettings,
  RUN_STARTED_EVENT,
  RunStartedPayloadSchema,
  runSubject,
  setIssuePaused,
  updateProposedSpec,
  validateSpec,
  type DeliveryTargets,
} from '@agent-factory/application';
import { ISSUE_ESCALATION_STATE, type SettingsChange } from '@agent-factory/domain';
import type { FactoryContainer } from '../composition/factory-container.ts';
import type { SequenceCursor } from './sequence-cursor.ts';
import { DECISION_QUESTION_PREFIX } from '../projections/run-views.ts';

function requestDecisionSettings(factory: FactoryContainer): RequestDecisionSettings {
  return { requestsDirectory: factory.config.directories.requests, conventions: factory.settings.conventions };
}

function issueResumer(factory: FactoryContainer): ResumeIssue {
  return new ResumeIssue(factory.dependencies, { conventions: factory.settings.conventions, escalation: factory.settings.implementerEscalation });
}

export const UNKNOWN_COMMAND = 'unknown-command';
export const COCKPIT_CHANNEL = 'cockpit';
const INCOMING_DIRECTORY = '.incoming';
const DATA_URL = /^data:([^;,]+)?(;base64)?,(.*)$/s;
const BASE64 = 'base64';
const UTF8 = 'utf8';
const FIRST_SEQUENCE = 0;
const ISSUE_SUBJECT_KIND = 'issue';
const HTTP = { ok: 200, badRequest: 400, notFound: 404, conflict: 409 } as const;

export interface DaemonControl {
  stopIssue(issueNumber: number): boolean;
  stopBackground(): boolean;
  reloadConfiguration(): Promise<void>;
}

export interface CommandContext {
  readonly factory: FactoryContainer;
  readonly daemon: DaemonControl | null;
  readonly operator: string;
}

export interface CommandResponse {
  readonly status: number;
  readonly body: { readonly sequence: number } | { readonly error: string; readonly command?: string };
}

export class CommandRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandRefusedError';
  }
}

type Handler = (raw: unknown, context: CommandContext) => Promise<void>;

function command<B>(schema: z.ZodType<B>, handler: (body: B, context: CommandContext) => Promise<unknown>): Handler {
  return async (raw, context) => {
    await handler(schema.parse(raw), context);
  };
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

async function runOfSubject(context: CommandContext, runId: string): Promise<{ readonly kind: string; readonly id: string }> {
  const subject = runSubject(runId);
  const started = (await context.factory.dependencies.events.read(subject, FIRST_SEQUENCE)).find(
    (record) => record.subject === subject && record.type === RUN_STARTED_EVENT,
  );
  if (started === undefined) throw new CommandRefusedError(`run ${runId} is unknown`);
  return RunStartedPayloadSchema.parse(started.payload).subject;
}

function deliveryTargets(factory: FactoryContainer): DeliveryTargets | null {
  const delivery = factory.config.delivery;
  if (delivery === null) return null;
  const targets = Object.fromEntries(Object.entries(delivery.environments).map(([environment, target]) => [environment, target.name]));
  return { workflow: delivery.workflow, targets };
}

async function changeSettings(context: CommandContext, change: SettingsChange): Promise<void> {
  const { factory, daemon, operator } = context;
  await new ChangeSettings({ events: factory.dependencies.events, document: factory.settingsDocument }).change(change, operator);
  if (daemon === null) await factory.configuration.reload();
  else await daemon.reloadConfiguration();
}

function requireDaemon(context: CommandContext): DaemonControl {
  if (context.daemon === null) throw new CommandRefusedError('the factory is not running; start it with "factory start"');
  return context.daemon;
}

export const COMMAND_HANDLERS: Readonly<Record<CommandName, Handler>> = {
  'request.create': command(COMMAND_BODY_SCHEMAS['request.create'], async (body, { factory }) => {
    const incoming = join(factory.config.directories.requests, INCOMING_DIRECTORY, randomUUID());
    try {
      await decodeAttachments(incoming, body.attachments);
      await new AddRequest(
        { events: factory.dependencies.events, files: factory.dependencies.files, clock: factory.clock },
        { requestsDirectory: factory.config.directories.requests },
      ).add({
        title: body.title,
        requester: body.requester,
        channel: COCKPIT_CHANNEL,
        body: body.body,
        images: body.attachments.map((attachment) => ({ name: attachment.name.replaceAll('/', '_'), sourceDirectory: incoming })),
      });
    } finally {
      await rm(incoming, { recursive: true, force: true });
    }
  }),
  'request.challenge': command(COMMAND_BODY_SCHEMAS['request.challenge'], (body, { factory, operator }) =>
    requestChallenge(factory.dependencies.events, body.requestId, operator),
  ),
  'request.decline': command(COMMAND_BODY_SCHEMAS['request.decline'], (body, { factory }) => declineRequest(factory.dependencies.events, body.requestId, body.reason)),
  'request.update-spec': command(COMMAND_BODY_SCHEMAS['request.update-spec'], (body, { factory }) =>
    updateProposedSpec(factory.dependencies, requestDecisionSettings(factory), body.requestId, body.specId, body.spec),
  ),
  'request.accept': command(COMMAND_BODY_SCHEMAS['request.accept'], (body, { factory }) =>
    acceptProposedSpecs(factory.dependencies, requestDecisionSettings(factory), body.requestId, body.specIds),
  ),
  'issue.validate-spec': command(COMMAND_BODY_SCHEMAS['issue.validate-spec'], (body, { factory, operator }) =>
    validateSpec(factory.dependencies, body.issueNumber, operator, factory.settings.conventions),
  ),
  'issue.start': command(COMMAND_BODY_SCHEMAS['issue.start'], (body, { factory, operator }) =>
    setIssuePaused(factory.dependencies.events, body.issueNumber, false, `started by ${operator}`),
  ),
  'issue.pause': command(COMMAND_BODY_SCHEMAS['issue.pause'], async (body, { factory, daemon, operator }) => {
    await setIssuePaused(factory.dependencies.events, body.issueNumber, true, `paused by ${operator}`);
    daemon?.stopIssue(body.issueNumber);
  }),
  'issue.resume': command(COMMAND_BODY_SCHEMAS['issue.resume'], async (body, { factory, operator }) => {
    const journal = await loadJournal(factory.dependencies.events, body.issueNumber);
    if (journal.state === ISSUE_ESCALATION_STATE) {
      await issueResumer(factory).resume(body.issueNumber);
    }
    await setIssuePaused(factory.dependencies.events, body.issueNumber, false, `resumed by ${operator}`);
  }),
  'issue.abandon': command(COMMAND_BODY_SCHEMAS['issue.abandon'], (body, { factory, operator }) =>
    new AbandonIssue(factory.dependencies).abandon({ issueNumber: body.issueNumber, operator, reason: body.reason }),
  ),
  'issue.rewrite-check': command(COMMAND_BODY_SCHEMAS['issue.rewrite-check'], async (body, { factory, daemon, operator }) => {
    const { events, states } = factory.dependencies;
    const ordered = await new OrderCheckRewrite({ events, states, clock: factory.clock }).order({
      issueNumber: body.issueNumber,
      path: body.path,
      instruction: body.instruction,
      operator,
    });
    if (ordered.driven) daemon?.stopIssue(body.issueNumber);
  }),
  'run.stop': command(COMMAND_BODY_SCHEMAS['run.stop'], async (body, context) => {
    const daemon = requireDaemon(context);
    const subject = await runOfSubject(context, body.runId);
    if (subject.kind === ISSUE_SUBJECT_KIND) {
      await setIssuePaused(context.factory.dependencies.events, Number(subject.id), true, `run ${body.runId} stopped by ${context.operator}`);
      daemon.stopIssue(Number(subject.id));
      return;
    }
    if (!daemon.stopBackground()) throw new CommandRefusedError(`run ${body.runId} is not running`);
  }),
  'run.resume': command(COMMAND_BODY_SCHEMAS['run.resume'], async (body, context) => {
    const subject = await runOfSubject(context, body.runId);
    if (subject.kind !== ISSUE_SUBJECT_KIND) throw new CommandRefusedError(`a ${subject.kind} run resumes by asking for it again`);
    await setIssuePaused(context.factory.dependencies.events, Number(subject.id), false, `run ${body.runId} resumed by ${context.operator}`);
  }),
  'run.answer': command(COMMAND_BODY_SCHEMAS['run.answer'], async (body, context) => {
    const subject = await runOfSubject(context, body.runId);
    if (subject.kind !== ISSUE_SUBJECT_KIND) throw new CommandRefusedError(`a ${subject.kind} run asks no question`);
    if (body.questionId !== `${DECISION_QUESTION_PREFIX}${body.runId}`) {
      throw new CommandRefusedError(`question ${body.questionId} does not belong to run ${body.runId}`);
    }
    const { factory } = context;
    await issueResumer(factory).resume(Number(subject.id), body.answer);
  }),
  'pr.merge': command(COMMAND_BODY_SCHEMAS['pr.merge'], (body, { factory }) =>
    new MergeOnOrder(factory.dependencies).merge({ pullRequestNumber: body.number, expectedHeadSha: body.expectedHeadSha }),
  ),
  'pr.feedback': command(COMMAND_BODY_SCHEMAS['pr.feedback'], (body, { factory }) =>
    new PullRequestFeedback({ ...factory.dependencies, clock: factory.clock }, factory.settings.implementerEscalation).record({
      pullRequestNumber: body.number,
      author: body.author,
      source: COCKPIT_CHANNEL,
      body: body.body,
    }),
  ),
  'deployment.redeploy': command(COMMAND_BODY_SCHEMAS['deployment.redeploy'], (body, { factory, operator }) =>
    new RedeployEnvironment(factory.dependencies, deliveryTargets(factory)).redeploy({ environment: body.environment, confirmVersion: body.confirmVersion, operator }),
  ),
  'release.cut': command(COMMAND_BODY_SCHEMAS['release.cut'], (body, { factory, operator }) =>
    new CutRelease({ events: factory.dependencies.events, github: factory.dependencies.github, health: factory.health, rules: attributionRules(factory.settings.conventions) }).cut({ releaseId: body.releaseId, operator }),
  ),
  'release.evaluate': command(COMMAND_BODY_SCHEMAS['release.evaluate'], async (body, { factory }) => {
    const { events, github } = factory.dependencies;
    await evaluateRelease({ events, github, health: factory.health, rules: attributionRules(factory.settings.conventions) }, await detectedRelease(events, body.releaseId));
  }),
  'audit.publish-issue': command(COMMAND_BODY_SCHEMAS['audit.publish-issue'], (body, { factory }) => publishAuditIssue(factory.dependencies, factory.settings.conventions, body.auditId)),
  'audit.resolve': command(COMMAND_BODY_SCHEMAS['audit.resolve'], (body, { factory }) => resolveAudit(factory.dependencies.events, body.auditId, body.note)),
  'settings.update-role': command(COMMAND_BODY_SCHEMAS['settings.update-role'], (body, context) =>
    changeSettings(context, { kind: 'role', role: body.role, model: body.model, effort: body.effort, maxBudgetUsd: body.maxBudgetUsd, maxTurns: body.maxTurns }),
  ),
  'settings.update-limits': command(COMMAND_BODY_SCHEMAS['settings.update-limits'], (body, context) =>
    changeSettings(context, {
      kind: 'limits',
      concurrentIssues: body.concurrencyCeiling,
      minimumFreeMemoryPercent: body.freeMemoryThresholdPercent,
      pauseAbovePressure: body.pauseAbovePressure,
    }),
  ),
  'costs.update-caps': command(COMMAND_BODY_SCHEMAS['costs.update-caps'], (body, context) =>
    changeSettings(context, { kind: 'caps', dailyCapUsd: body.dailyUsd, perRunCapUsd: body.perRunUsd, pauseAtUtilization: body.pauseAtUtilization }),
  ),
  'settings.test-tool': command(COMMAND_BODY_SCHEMAS['settings.test-tool'], (body, { factory, operator }) =>
    checkTool(factory.dependencies.events, factory.tools, body.tool, operator),
  ),
  'scheduler.pause': command(COMMAND_BODY_SCHEMAS['scheduler.pause'], (_body, { factory, operator }) =>
    pauseScheduling(factory.dependencies.events, 'operator', `paused by ${operator}`, null),
  ),
  'scheduler.resume': command(COMMAND_BODY_SCHEMAS['scheduler.resume'], (_body, { factory }) => resumeScheduling(factory.dependencies.events, 'operator')),
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
  await cursor.latest();
  try {
    await handler(raw, context);
  } catch (error) {
    if (error instanceof z.ZodError) return { status: HTTP.badRequest, body: { error: `invalid body: ${z.prettifyError(error)}`, command: name } };
    return { status: HTTP.conflict, body: { error: errorText(error), command: name } };
  }
  return { status: HTTP.ok, body: { sequence: await cursor.latest() } };
}
