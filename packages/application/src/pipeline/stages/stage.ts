import type { IssueState } from '@agent-factory/domain';
import type { FilmBodies } from '../../film/film-bodies.ts';
import type { PipelineDependencies } from '../pipeline-dependencies.ts';
import type { AgentRuns } from '../agent-runs.ts';
import type { EvidenceCollector } from '../evidence.ts';
import type { OrchestratorGate } from '../gate-runner.ts';
import type { IssueStacks } from '../issue-stack.ts';
import type { IssueJournalWriter } from '../journal-writer.ts';
import type { PipelineJournal } from '../pipeline-journal.ts';
import type { PipelineSettings } from '../pipeline-settings.ts';
import type { PullRequestBodyRenderer } from '../pull-request-body.ts';
import type { RunIssueOutcome } from '../run-issue-outcome.ts';
import type { ShellCommands } from '../shell-commands.ts';
import type { StructuredAcceptance } from '../structured-acceptance.ts';

export interface PipelineToolkit {
  readonly dependencies: PipelineDependencies;
  readonly settings: PipelineSettings;
  readonly agents: AgentRuns;
  readonly gate: OrchestratorGate;
  readonly shell: ShellCommands;
  readonly acceptance: StructuredAcceptance;
  readonly evidence: EvidenceCollector;
  readonly bodies: PullRequestBodyRenderer;
  readonly stacks: IssueStacks;
  /** Announces and renders the films of the pull request; null when the project films nothing. */
  readonly films: FilmBodies | null;
}

export interface StageContext {
  readonly journal: PipelineJournal;
  readonly writer: IssueJournalWriter;
  readonly toolkit: PipelineToolkit;
}

export type StageResult = { readonly kind: 'advanced' } | { readonly kind: 'stopped'; readonly outcome: RunIssueOutcome };

export const ADVANCED: StageResult = { kind: 'advanced' };

export interface PipelineStage {
  readonly handles: readonly (IssueState | null)[];
  advance(context: StageContext): Promise<StageResult>;
}
