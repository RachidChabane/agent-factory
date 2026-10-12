import type { IssueSpec } from '@agent-factory/domain';
import type { AgentRunResult, Worktree } from '../../ports.ts';
import {
  answeredDecisionAddendum,
  answeredDecisionPrompt,
  answerFor,
  DECISION_REQUEST_PATH,
  decisionRequestReason,
} from '../decision-request.ts';
import { agentFailureSummary, FINAL_TEXT_TAIL_LINES } from '../failure-summary.ts';
import { composeGateCommand } from '../gate-runner.ts';
import { PIPELINE_EVENTS, type FrozenRecord, type ImplementerAttemptRecord } from '../journal-events.ts';
import { EscalationRequiredError } from '../pipeline-errors.ts';
import { attemptRecord, currentAttempt } from '../pipeline-journal.ts';
import { planAttempt, settleFailure, type AttemptPlan } from '../retry.ts';
import { checkRewriteImplementerAddendum, earlierAttemptsAddendum, implementerCorrectionPrompt, implementerValues, withAddendum } from '../role-prompts.ts';
import { tailLines } from '../shell-commands.ts';
import { leasedWorktree, requireFrozen, requireManifest, requireSpec } from './journal-facts.ts';
import { ADVANCED, type PipelineStage, type StageContext, type StageResult } from './stage.ts';
import { profileOf, readCheckContents } from './stage-support.ts';

interface AnsweredDecision {
  readonly request: ImplementerAttemptRecord;
  readonly answer: string;
}

function decisionText(record: ImplementerAttemptRecord): string {
  return record.decisionRequest ?? record.finalTextTail;
}

function answeredPlan(attempt: number, answered: AnsweredDecision): AttemptPlan {
  const { request } = answered;
  return {
    attempt,
    mode: 'resumed',
    model: request.model,
    effort: request.effort,
    resumeSessionId: request.sessionId,
    correction: null,
    earlierFailures: null,
  };
}

export class ImplementingStage implements PipelineStage {
  readonly handles = ['implementing'] as const;

  async advance(context: StageContext): Promise<StageResult> {
    const { journal, writer } = context;
    const attempt = currentAttempt(journal);
    const recorded = attemptRecord(journal, attempt);
    if (recorded === null) {
      await this.runAttempt(context, attempt, null);
      return ADVANCED;
    }
    if (recorded.outcome === 'success') {
      await writer.transition('gating', `implementer attempt ${attempt + 1} finished`);
      return ADVANCED;
    }
    if (recorded.outcome === 'decision-requested') {
      const answer = answerFor(journal, recorded.runId);
      if (answer === null) throw new EscalationRequiredError(decisionRequestReason(decisionText(recorded)));
      await this.runAttempt(context, attempt, { request: recorded, answer: answer.answer });
      return ADVANCED;
    }
    if (recorded.gateBlocks > 0) {
      await writer.transition(
        'gating',
        `implementer attempt ${attempt + 1} ended with outcome ${recorded.outcome} after the completion gate refused ${recorded.gateBlocks} stops`,
      );
      return ADVANCED;
    }
    await settleFailure(context, attempt, {
      source: 'agent',
      summary: agentFailureSummary('implementer', recorded.outcome, recorded.finalTextTail),
    });
    return ADVANCED;
  }

  private async runAttempt(context: StageContext, attempt: number, answered: AnsweredDecision | null): Promise<void> {
    const { journal, writer, toolkit } = context;
    const { files } = toolkit.dependencies;
    const spec = requireSpec(journal);
    const frozen = requireFrozen(journal);
    const manifest = requireManifest(journal);
    const worktree = await leasedWorktree(context);
    const profile = profileOf(context, 'implementer');
    const plan = answered === null ? planAttempt(journal, attempt, profile) : answeredPlan(attempt, answered);
    await files.remove(worktree.path, DECISION_REQUEST_PATH);
    const result = await toolkit.agents.run(writer, {
      role: 'implementer',
      profile,
      model: plan.model,
      effort: plan.effort,
      workingDirectory: worktree.path,
      prompt: await this.promptFor(context, plan, spec, worktree, frozen, answered),
      resumeSessionId: plan.resumeSessionId,
      frozenChecks: frozen.checks,
      gateCommand: composeGateCommand(toolkit.settings.gate, manifest, toolkit.dependencies.sandbox, worktree.path),
      attempt,
      branch: journal.branch,
      decisionRequestPath: DECISION_REQUEST_PATH,
    });
    await writer.record(PIPELINE_EVENTS.implementerAttemptFinished, {
      attempt,
      mode: plan.mode,
      model: plan.model,
      effort: plan.effort,
      runId: result.runId,
      sessionId: result.sessionId,
      outcome: result.outcome,
      gateBlocks: result.gateBlocks,
      finalTextTail: tailLines(result.finalText, FINAL_TEXT_TAIL_LINES),
      decisionRequest: await this.decisionRequestOf(context, worktree, result),
    });
  }

  private async decisionRequestOf(context: StageContext, worktree: Worktree, result: AgentRunResult): Promise<string | null> {
    if (result.outcome !== 'decision-requested') return null;
    const request = (await context.toolkit.dependencies.files.readText(worktree.path, DECISION_REQUEST_PATH))?.trim() ?? '';
    return request === '' ? result.finalText : request;
  }

  private async promptFor(
    context: StageContext,
    plan: AttemptPlan,
    spec: IssueSpec,
    worktree: Worktree,
    frozen: FrozenRecord,
    answered: AnsweredDecision | null,
  ): Promise<string> {
    if (answered !== null && plan.resumeSessionId !== null) return answeredDecisionPrompt(answered.answer);
    if (plan.correction !== null) return implementerCorrectionPrompt(spec, plan.correction);
    const { dependencies, settings } = context.toolkit;
    const checks = await readCheckContents(context, worktree, frozen);
    const rendered = dependencies.roles.render('implementer', implementerValues(settings.repository, spec, checks));
    if (answered !== null) return withAddendum(rendered, answeredDecisionAddendum(decisionText(answered.request), answered.answer));
    const rewrite = context.journal.checkRewrites.at(-1);
    if (plan.mode === 'initial' && rewrite !== undefined && rewrite.nextAttempt === plan.attempt) {
      return withAddendum(rendered, checkRewriteImplementerAddendum(rewrite.path, rewrite.instruction));
    }
    return withAddendum(rendered, plan.earlierFailures === null ? null : earlierAttemptsAddendum(plan.earlierFailures));
  }
}
