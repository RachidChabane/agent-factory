import { CHECK_REWRITABLE_STATES, ISSUE_CHECK_REWRITE_STATE, ISSUE_ESCALATION_STATE } from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';
import { AgentRunAdmission } from '../resources/agent-run-admission.ts';
import { AgentRuns, type AgentEventListener } from './agent-runs.ts';
import { EvidenceCollector } from './evidence.ts';
import { OrchestratorGate } from './gate-runner.ts';
import { IssueStacks } from './issue-stack.ts';
import { IssueJournalWriter } from './journal-writer.ts';
import type { PipelineDependencies } from './pipeline-dependencies.ts';
import { EscalationRequiredError, PipelineStalledError } from './pipeline-errors.ts';
import { loadJournal, type PipelineJournal } from './pipeline-journal.ts';
import type { PipelineSettings } from './pipeline-settings.ts';
import { PullRequestBodyRenderer } from './pull-request-body.ts';
import type { RunIssueOutcome } from './run-issue-outcome.ts';
import { ShellCommands } from './shell-commands.ts';
import { StructuredAcceptance } from './structured-acceptance.ts';
import { AuthoringChecksStage } from './stages/authoring-checks-stage.ts';
import { CheckRewriteStage } from './stages/check-rewrite-stage.ts';
import { ChecksFrozenStage } from './stages/checks-frozen-stage.ts';
import { GatingStage } from './stages/gating-stage.ts';
import { ImplementingStage } from './stages/implementing-stage.ts';
import { IntakeStage } from './stages/intake-stage.ts';
import { ProducingEvidenceStage } from './stages/producing-evidence-stage.ts';
import { ReviewingStage } from './stages/reviewing-stage.ts';
import { StartStage } from './stages/start-stage.ts';
import type { PipelineStage, PipelineToolkit } from './stages/stage.ts';

export const MAX_PIPELINE_STEPS = 200;
const UNKNOWN_ESCALATION_REASON = 'no reason recorded';

export interface IssuePipelineOptions {
  readonly onAgentEvent?: AgentEventListener;
  readonly signal?: AbortSignal;
}

const STAGES: readonly PipelineStage[] = [
  new IntakeStage(),
  new StartStage(),
  new AuthoringChecksStage(),
  new ChecksFrozenStage(),
  new CheckRewriteStage(),
  new ImplementingStage(),
  new GatingStage(),
  new ReviewingStage(),
  new ProducingEvidenceStage(),
];

function stageFor(state: IssueState | null): PipelineStage | null {
  return STAGES.find((stage) => stage.handles.includes(state)) ?? null;
}

function finalOutcome(journal: PipelineJournal, state: IssueState): RunIssueOutcome {
  if (state === ISSUE_ESCALATION_STATE) {
    return { kind: 'needs-human', issueNumber: journal.issueNumber, reason: journal.escalationReason ?? UNKNOWN_ESCALATION_REASON };
  }
  if (state === 'pr-open' && journal.pullRequest !== null) {
    return { kind: 'pr-open', issueNumber: journal.issueNumber, pullRequest: journal.pullRequest };
  }
  return { kind: 'beyond-pipeline', issueNumber: journal.issueNumber, state };
}

function awaitsCheckRewrite(journal: PipelineJournal): boolean {
  return journal.checkRewrite !== null && journal.state !== null && CHECK_REWRITABLE_STATES.includes(journal.state);
}

function ignoreAgentEvent(): void {
  return;
}

export class IssuePipeline {
  private readonly dependencies: PipelineDependencies;
  private readonly toolkit: PipelineToolkit;

  constructor(dependencies: PipelineDependencies, settings: PipelineSettings, options: IssuePipelineOptions = {}) {
    this.dependencies = dependencies;
    const { gate } = settings;
    const shell = new ShellCommands(dependencies.runner, dependencies.sandbox, gate.environment, gate.commandTimeoutMs, gate.niceness);
    const admission = new AgentRunAdmission(dependencies.resources, settings.resources);
    this.toolkit = {
      dependencies,
      settings,
      shell,
      acceptance: new StructuredAcceptance(shell, dependencies.files),
      agents: new AgentRuns(
        dependencies.harness,
        admission,
        dependencies.ids,
        options.onAgentEvent ?? ignoreAgentEvent,
        options.signal ?? new AbortController().signal,
      ),
      gate: new OrchestratorGate(dependencies.sourceControl, dependencies.files, shell, settings.gate, settings.setupCommands),
      evidence: new EvidenceCollector(dependencies.files, settings.evidenceCacheDirectory),
      bodies: new PullRequestBodyRenderer(),
      stacks: new IssueStacks({ services: dependencies.services, logs: dependencies.logs, slots: dependencies.stackSlots }, settings.stack, shell),
    };
  }

  async runIssue(issueNumber: number): Promise<RunIssueOutcome> {
    const writer = new IssueJournalWriter(this.dependencies.events, this.dependencies.states, issueNumber);
    for (let step = 0; step < MAX_PIPELINE_STEPS; step += 1) {
      const journal = await loadJournal(this.dependencies.events, issueNumber);
      if (awaitsCheckRewrite(journal)) {
        await writer.transition(ISSUE_CHECK_REWRITE_STATE, `the operator ordered a rewrite of ${journal.checkRewrite?.order.path ?? 'a check'}`);
        continue;
      }
      const stage = stageFor(journal.state);
      if (stage === null && journal.state !== null) return finalOutcome(journal, journal.state);
      if (stage === null) throw new PipelineStalledError(issueNumber, step);
      try {
        const result = await stage.advance({ journal, writer, toolkit: this.toolkit });
        if (result.kind === 'stopped') return result.outcome;
      } catch (error) {
        if (!(error instanceof EscalationRequiredError)) throw error;
        await writer.escalate(error.reason);
      }
    }
    throw new PipelineStalledError(issueNumber, MAX_PIPELINE_STEPS);
  }
}
