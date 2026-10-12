import type { IssueSpec } from '@agent-factory/domain';
import { ACCEPTANCE_MANIFEST_PATH, checkPaths, readAcceptanceManifest, type AcceptanceManifest } from '../../acceptance/acceptance-manifest.ts';
import type { Worktree } from '../../ports.ts';
import { checksCommitMessage } from '../conventional-commit.ts';
import { agentFailureSummary, agentStoppedSummary } from '../failure-summary.ts';
import { PIPELINE_EVENTS } from '../journal-events.ts';
import { EscalationRequiredError } from '../pipeline-errors.ts';
import {
  acceptanceAuthorValues,
  beforeProofCorrectionPrompt,
  manifestCorrectionPrompt,
  scoreOutputAddendum,
  withAddendum,
} from '../role-prompts.ts';
import type { PipelineJournal } from '../pipeline-journal.ts';
import { accessOf, describeOutcome, EXIT_CODE_SUCCESS, tailLines } from '../shell-commands.ts';
import { measureBeforeProof } from './before-proof-measurement.ts';
import { requireSpec, leasedWorktree } from './journal-facts.ts';
import { ADVANCED, type PipelineStage, type StageContext, type StageResult } from './stage.ts';
import { assertOnlyChecksChanged, issueTypeOfSpec, profileOf } from './stage-support.ts';

export const MANIFEST_CORRECTIONS = 1;
export const BEFORE_PROOF_CORRECTIONS = 1;
export const WORKSPACE_SETUP_LOG = 'workspace-setup.log';
const LOG_SEPARATOR = '\n\n';
const NEWLINE = '\n';

type ManifestOutcome =
  | { readonly kind: 'valid'; readonly manifest: AcceptanceManifest }
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid'; readonly problems: readonly string[] };

function invalidManifestReason(problems: readonly string[]): string {
  return `the acceptance manifest is not valid:${NEWLINE}${problems.map((problem) => `- ${problem}`).join(NEWLINE)}`;
}

interface AuthoringOpening {
  readonly prompt: string;
  readonly resumeSessionId: string | null;
}

export function lastAuthorSession(journal: PipelineJournal): string | null {
  return journal.agentRuns.findLast((run) => run.role === 'acceptance-author')?.sessionId ?? null;
}

function invalidBeforeProofReason(journal: PipelineJournal, reason: string): string {
  return journal.beforeProofCorrections.length === 0
    ? `the before proof is not valid: ${reason}`
    : `the before proof is not valid after ${journal.beforeProofCorrections.length} correction by the acceptance-author: ${reason}`;
}

export class AuthoringChecksStage implements PipelineStage {
  readonly handles = ['authoring-checks'] as const;

  async advance(context: StageContext): Promise<StageResult> {
    const { journal, writer } = context;
    const spec = requireSpec(journal);
    const worktree = await leasedWorktree(context);
    if (!journal.workspacePrepared) {
      await this.prepareWorkspace(context, worktree);
      return ADVANCED;
    }
    if (journal.manifest === null) {
      await this.authorChecks(context, worktree, spec, this.opening(context, spec));
      return ADVANCED;
    }
    if (journal.beforeProof === null) {
      await this.recordBeforeProof(context, worktree, spec, journal.manifest);
      return ADVANCED;
    }
    if (!journal.beforeProof.evaluation.valid) {
      await this.requestCorrection(context, journal.beforeProof.evaluation.reason);
      return ADVANCED;
    }
    if (journal.frozen === null) {
      await this.freeze(context, worktree, spec, journal.manifest);
      return ADVANCED;
    }
    await writer.transition('checks-frozen', `${journal.frozen.checks.length} acceptance checks frozen`);
    return ADVANCED;
  }

  private async prepareWorkspace(context: StageContext, worktree: Worktree): Promise<void> {
    const { toolkit, writer, journal } = context;
    const log: string[] = [];
    for (const command of toolkit.settings.setupCommands) {
      const outcome = await toolkit.shell.execute(command.run, worktree.path, accessOf(command));
      log.push(describeOutcome(command.run, outcome));
      if (outcome.kind === 'not-runnable' || outcome.exitCode !== EXIT_CODE_SUCCESS) {
        await toolkit.dependencies.logs.write(journal.issueNumber, WORKSPACE_SETUP_LOG, log.join(LOG_SEPARATOR));
        throw new EscalationRequiredError(`the workspace setup failed at ${command.name}:\n${tailLines(describeOutcome(command.run, outcome))}`);
      }
    }
    await toolkit.dependencies.logs.write(journal.issueNumber, WORKSPACE_SETUP_LOG, log.join(LOG_SEPARATOR));
    await writer.record(PIPELINE_EVENTS.workspacePrepared, { logName: WORKSPACE_SETUP_LOG });
  }

  private opening(context: StageContext, spec: IssueSpec): AuthoringOpening {
    const pending = context.journal.pendingBeforeProofCorrection;
    if (pending !== null) return { prompt: beforeProofCorrectionPrompt(pending.reason), resumeSessionId: pending.sessionId };
    const { dependencies, settings } = context.toolkit;
    const type = issueTypeOfSpec(context, spec);
    const rendered = dependencies.roles.render('acceptance-author', acceptanceAuthorValues(settings.repository, spec, type));
    return { prompt: withAddendum(rendered, scoreOutputAddendum(type)), resumeSessionId: null };
  }

  private async requestCorrection(context: StageContext, reason: string): Promise<void> {
    const { journal, writer } = context;
    const sessionId = lastAuthorSession(journal);
    if (journal.beforeProofCorrections.length >= BEFORE_PROOF_CORRECTIONS || sessionId === null) {
      throw new EscalationRequiredError(invalidBeforeProofReason(journal, reason));
    }
    await writer.record(PIPELINE_EVENTS.beforeProofCorrectionRequested, { correction: journal.beforeProofCorrections.length + 1, reason, sessionId });
  }

  private async authorChecks(context: StageContext, worktree: Worktree, spec: IssueSpec, opening: AuthoringOpening): Promise<void> {
    const { toolkit, writer } = context;
    const profile = profileOf(context, 'acceptance-author');
    let { prompt, resumeSessionId } = opening;
    const type = issueTypeOfSpec(context, spec);
    for (let correction = 0; ; correction += 1) {
      const request = {
        role: 'acceptance-author' as const,
        profile,
        model: profile.model,
        effort: profile.effort,
        workingDirectory: worktree.path,
        prompt,
        resumeSessionId,
        frozenChecks: [],
        gateCommand: null,
        attempt: context.journal.beforeProofCorrections.length + correction,
        branch: context.journal.branch,
        decisionRequestPath: null,
      };
      const result = await toolkit.stacks.around(writer, context.journal.issueNumber, type.id, worktree.path, () => toolkit.agents.run(writer, request));
      if (result.outcome !== 'success') {
        throw new EscalationRequiredError(agentFailureSummary('acceptance-author', result.outcome, result.finalText));
      }
      const outcome = await this.readManifest(context, worktree, spec);
      if (outcome.kind === 'valid') {
        await writer.record(PIPELINE_EVENTS.acceptanceAuthored, { manifest: outcome.manifest });
        return;
      }
      if (outcome.kind === 'missing') {
        throw new EscalationRequiredError(agentStoppedSummary('acceptance-author', `${ACCEPTANCE_MANIFEST_PATH} was not written.`, result.finalText));
      }
      if (correction >= MANIFEST_CORRECTIONS || result.sessionId === null) throw new EscalationRequiredError(invalidManifestReason(outcome.problems));
      prompt = manifestCorrectionPrompt(outcome.problems);
      resumeSessionId = result.sessionId;
    }
  }

  private async readManifest(context: StageContext, worktree: Worktree, spec: IssueSpec): Promise<ManifestOutcome> {
    const { files } = context.toolkit.dependencies;
    const text = await files.readText(worktree.path, ACCEPTANCE_MANIFEST_PATH);
    if (text === null) return { kind: 'missing' };
    const reading = readAcceptanceManifest(text, spec, issueTypeOfSpec(context, spec));
    if (!reading.valid) return { kind: 'invalid', problems: reading.problems };
    const presence = await Promise.all(
      checkPaths(reading.manifest).map(async (path) => ({ path, present: await files.exists(worktree.path, path) })),
    );
    const missing = presence.filter((entry) => !entry.present).map((entry) => entry.path);
    if (missing.length > 0) return { kind: 'invalid', problems: [`the manifest declares check files that do not exist: ${missing.join(', ')}`] };
    return { kind: 'valid', manifest: reading.manifest };
  }

  private async recordBeforeProof(context: StageContext, worktree: Worktree, spec: IssueSpec, manifest: AcceptanceManifest): Promise<void> {
    await context.writer.record(PIPELINE_EVENTS.beforeProofRecorded, await measureBeforeProof(context, worktree, spec, manifest));
  }

  private async freeze(context: StageContext, worktree: Worktree, spec: IssueSpec, manifest: AcceptanceManifest): Promise<void> {
    const { toolkit, writer } = context;
    const { sourceControl } = toolkit.dependencies;
    await assertOnlyChecksChanged(context, worktree, manifest, 'files outside the checks changed before the freeze');
    const paths = checkPaths(manifest);
    const checks = await sourceControl.hashFiles(worktree, paths);
    let commitSha: string | null = null;
    if (paths.length > 0) {
      if (!(await sourceControl.isClean(worktree))) await sourceControl.commitAll(worktree, checksCommitMessage(spec, toolkit.settings.conventions));
      commitSha = await sourceControl.headSha(worktree);
    }
    await writer.record(PIPELINE_EVENTS.checksFrozen, { checks, commitSha });
  }
}
