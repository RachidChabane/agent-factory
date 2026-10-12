import { join } from 'node:path';
import { canTransitionRequest, type AgentRole, type EffortLevel } from '@agent-factory/domain';
import type {
  AgentHarness,
  AgentRunRequest,
  AgentRunResult,
  BaseCheckout,
  BaseCheckouts,
  Clock,
  EventStore,
  IdGenerator,
  KnowledgePack,
  RolePromptCatalog,
  WorkspaceFiles,
} from '../ports.ts';
import { parseChallengeAnswer, type ChallengeAnswer } from './challenge-answer.ts';
import { renderChallengeReport } from './challenge-report.ts';
import { RequestChallengeRefusedError, RequestNotFoundError } from './errors.ts';
import { renderSpecFile, singleLine, specFilePath } from './proposed-spec-file.ts';
import {
  REQUEST_CHALLENGED_EVENT,
  REQUEST_CHALLENGE_FAILED_EVENT,
  REQUEST_CHALLENGE_STARTED_EVENT,
  requestSubject,
  type ChallengeItemPayload,
  type ProposedSpecPayload,
  type RequestChallengeFailedPayload,
  type RequestChallengeStartedPayload,
  type RequestChallengedPayload,
} from './request-events.ts';
import { REQUEST_REPLY_FILE_NAME, REQUEST_REPORT_FILE_NAME, itemId, specId } from './request-files.ts';
import { loadRequest, type RequestRecord } from './request-projection.ts';

export const CHALLENGER_ROLE: AgentRole = 'challenger';
export const REQUEST_RUN_SUBJECT = 'request';
export const NO_IMAGES = 'none';
export const CHECKOUT_NAME_PREFIX = 'request-';

const LINE_SEPARATOR = '\n';

export interface ChallengeProfile {
  readonly model: string;
  readonly effort: EffortLevel;
  readonly maxBudgetUsd: number;
  readonly maxTurns: number;
  readonly timeoutMs: number;
}

export interface ChallengeRequestDependencies {
  readonly events: EventStore;
  readonly harness: AgentHarness;
  readonly roles: RolePromptCatalog;
  readonly files: WorkspaceFiles;
  readonly checkouts: BaseCheckouts;
  readonly knowledge: KnowledgePack;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface ChallengeRequestSettings {
  readonly repository: string;
  readonly requestsDirectory: string;
  readonly profile: ChallengeProfile;
}

export interface SpecProblemReport {
  readonly specId: string;
  readonly problems: readonly string[];
}

export type ChallengeOutcome =
  | {
      readonly status: 'challenged';
      readonly requestId: string;
      readonly runId: string;
      readonly items: readonly ChallengeItemPayload[];
      readonly specPaths: readonly string[];
      readonly problems: readonly SpecProblemReport[];
    }
  | { readonly status: 'failed'; readonly requestId: string; readonly runId: string; readonly reason: string };

function ignoreRunEvent(): void {
  return;
}

function toItems(answer: ChallengeAnswer): readonly ChallengeItemPayload[] {
  return answer.items.map((item, index) => ({ ...item, id: itemId(index + 1) }));
}

export class ChallengeRequest {
  private readonly dependencies: ChallengeRequestDependencies;
  private readonly settings: ChallengeRequestSettings;

  constructor(dependencies: ChallengeRequestDependencies, settings: ChallengeRequestSettings) {
    this.dependencies = dependencies;
    this.settings = settings;
  }

  async challenge(requestId: string, signal: AbortSignal = new AbortController().signal): Promise<ChallengeOutcome> {
    const { events, checkouts } = this.dependencies;
    const request = await loadRequest(events, requestId);
    if (request === null) throw new RequestNotFoundError(requestId);
    if (request.state !== 'challenging' && !canTransitionRequest(request.state, 'challenging')) {
      throw new RequestChallengeRefusedError(requestId, request.state);
    }

    const checkout = await checkouts.checkout(`${CHECKOUT_NAME_PREFIX}${requestId}`);
    let runId: string;
    let result: AgentRunResult | Error;
    try {
      runId = this.dependencies.ids.next();
      const prompt = await this.renderPrompt(request);
      const started: RequestChallengeStartedPayload = { runId };
      await events.append(REQUEST_CHALLENGE_STARTED_EVENT, requestSubject(requestId), started);
      result = await this.execute(this.runRequest(request, runId, prompt, checkout), signal);
    } finally {
      await checkouts.remove(checkout);
    }

    if (result instanceof Error) return this.fail(requestId, runId, `the run failed: ${result.message}`);
    if (result.outcome !== 'success') return this.fail(requestId, runId, `the run ended with outcome ${result.outcome}`);
    const parsed = parseChallengeAnswer(result.finalText);
    if (!parsed.ok) return this.fail(requestId, runId, parsed.reason);
    return this.conclude(request, runId, parsed.answer);
  }

  private async renderPrompt(request: RequestRecord): Promise<string> {
    const { roles, knowledge } = this.dependencies;
    const directory = join(this.settings.requestsDirectory, request.id);
    const images = request.attachments.map((attachment) => join(directory, attachment.path));
    return roles.render(CHALLENGER_ROLE, {
      repository: this.settings.repository,
      request: request.body,
      images: images.length === 0 ? NO_IMAGES : images.join(LINE_SEPARATOR),
      knowledge: await knowledge.read(),
    });
  }

  private runRequest(request: RequestRecord, runId: string, prompt: string, checkout: BaseCheckout): AgentRunRequest {
    const { profile } = this.settings;
    return {
      runId,
      context: { subject: { kind: REQUEST_RUN_SUBJECT, id: request.id }, attempt: request.challengeAttempts, branch: null },
      account: null,
      role: CHALLENGER_ROLE,
      model: profile.model,
      effort: profile.effort,
      workingDirectory: checkout.path,
      prompt,
      appendSystemPrompt: '',
      allowedTools: [],
      mcpServers: {},
      resumeSessionId: null,
      maxBudgetUsd: profile.maxBudgetUsd,
      maxTurns: profile.maxTurns,
      frozenChecks: [],
      gateCommand: null,
      decisionRequestPath: null,
      timeoutMs: profile.timeoutMs,
    };
  }

  private async execute(request: AgentRunRequest, signal: AbortSignal): Promise<AgentRunResult | Error> {
    try {
      return await this.dependencies.harness.run(request, ignoreRunEvent, signal);
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  private async fail(requestId: string, runId: string, reason: string): Promise<ChallengeOutcome> {
    const failed: RequestChallengeFailedPayload = { runId, reason };
    await this.dependencies.events.append(REQUEST_CHALLENGE_FAILED_EVENT, requestSubject(requestId), failed);
    return { status: 'failed', requestId, runId, reason };
  }

  private async conclude(request: RequestRecord, runId: string, answer: ChallengeAnswer): Promise<ChallengeOutcome> {
    const { files, events, clock } = this.dependencies;
    const directory = join(this.settings.requestsDirectory, request.id);
    const items = toItems(answer);
    const specs: ProposedSpecPayload[] = [];
    for (const [index, proposed] of answer.specs.entries()) {
      const number = index + 1;
      const title = singleLine(proposed.title);
      const rendered = renderSpecFile({ ...proposed, title });
      const path = specFilePath(number, title);
      await files.writeText(directory, path, rendered.content);
      specs.push({
        id: specId(number),
        itemIds: proposed.items.map(itemId),
        title,
        type: proposed.type,
        need: proposed.need,
        acceptanceCriteria: proposed.acceptanceCriteria,
        outOfScope: proposed.outOfScope,
        expectedProof: proposed.expectedProof,
        path,
        problems: [...rendered.problems],
      });
    }
    await files.writeText(directory, REQUEST_REPORT_FILE_NAME, renderChallengeReport({ summary: answer.summary, items, specs }));
    await files.writeText(directory, REQUEST_REPLY_FILE_NAME, answer.reply);
    const challenged: RequestChallengedPayload = {
      runId,
      completedAt: clock.now().toISOString(),
      summary: answer.summary,
      items: [...items],
      specs,
      reply: answer.reply,
      reportPath: REQUEST_REPORT_FILE_NAME,
      replyPath: REQUEST_REPLY_FILE_NAME,
    };
    await events.append(REQUEST_CHALLENGED_EVENT, requestSubject(request.id), challenged);
    return {
      status: 'challenged',
      requestId: request.id,
      runId,
      items,
      specPaths: specs.map((spec) => spec.path),
      problems: specs.filter((spec) => spec.problems.length > 0).map((spec) => ({ specId: spec.id, problems: spec.problems })),
    };
  }
}
