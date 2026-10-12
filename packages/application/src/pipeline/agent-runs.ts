import type { EffortLevel, FrozenCheck } from '@agent-factory/domain';
import type { AgentHarness, AgentRunEvent, AgentRunResult, IdGenerator } from '../ports.ts';
import type { AgentRunAdmission } from '../resources/agent-run-admission.ts';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { PipelineAbortedError } from './pipeline-errors.ts';
import type { IssueJournalWriter } from './journal-writer.ts';
import type { PipelineRole, RoleProfile } from './pipeline-settings.ts';

export interface AgentRunInput {
  readonly role: PipelineRole;
  readonly profile: RoleProfile;
  readonly model: string;
  readonly effort: EffortLevel;
  readonly workingDirectory: string;
  readonly prompt: string;
  readonly resumeSessionId: string | null;
  readonly frozenChecks: readonly FrozenCheck[];
  readonly gateCommand: string | null;
  readonly attempt: number;
  readonly branch: string | null;
  readonly decisionRequestPath: string | null;
}

const ISSUE_RUN_SUBJECT = 'issue';
const DEFAULT_LOGIN: string | null = null;

const NO_APPENDED_SYSTEM_PROMPT = '';
const NO_EXTRA_TOOLS: readonly string[] = [];
const NO_MCP_SERVERS: Readonly<Record<string, unknown>> = {};

export type AgentEventListener = (issueNumber: number, runId: string, event: AgentRunEvent) => void;

export class AgentRuns {
  private readonly harness: AgentHarness;
  private readonly admission: AgentRunAdmission;
  private readonly ids: IdGenerator;
  private readonly listener: AgentEventListener;
  private readonly signal: AbortSignal;

  constructor(
    harness: AgentHarness,
    admission: AgentRunAdmission,
    ids: IdGenerator,
    listener: AgentEventListener,
    signal: AbortSignal,
  ) {
    this.harness = harness;
    this.admission = admission;
    this.ids = ids;
    this.listener = listener;
    this.signal = signal;
  }

  async run(journal: IssueJournalWriter, input: AgentRunInput): Promise<AgentRunResult> {
    if (this.signal.aborted) throw new PipelineAbortedError(journal.issueNumber);
    await this.admission.assertAdmitted();
    const runId = this.ids.next();
    await journal.record(PIPELINE_EVENTS.agentRunStarted, {
      role: input.role,
      runId,
      model: input.model,
      effort: input.effort,
      resumeSessionId: input.resumeSessionId,
    });
    const result = await this.harness.run(
      {
        runId,
        context: { subject: { kind: ISSUE_RUN_SUBJECT, id: String(journal.issueNumber) }, attempt: input.attempt, branch: input.branch },
        account: DEFAULT_LOGIN,
        role: input.role,
        model: input.model,
        effort: input.effort,
        workingDirectory: input.workingDirectory,
        prompt: input.prompt,
        appendSystemPrompt: NO_APPENDED_SYSTEM_PROMPT,
        allowedTools: NO_EXTRA_TOOLS,
        mcpServers: NO_MCP_SERVERS,
        resumeSessionId: input.resumeSessionId,
        maxBudgetUsd: input.profile.maxBudgetUsd,
        maxTurns: input.profile.maxTurns,
        frozenChecks: input.frozenChecks,
        gateCommand: input.gateCommand,
        decisionRequestPath: input.decisionRequestPath,
        timeoutMs: input.profile.timeoutMs,
      },
      (event) => this.listener(journal.issueNumber, runId, event),
      this.signal,
    );
    await journal.record(PIPELINE_EVENTS.agentRunFinished, {
      role: input.role,
      runId: result.runId,
      sessionId: result.sessionId,
      outcome: result.outcome,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      turns: result.turns,
      gateBlocks: result.gateBlocks,
      rawLogPath: result.rawLogPath,
    });
    if (this.signal.aborted) throw new PipelineAbortedError(journal.issueNumber);
    return result;
  }
}
