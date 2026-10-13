import { createHash } from 'node:crypto';
import type { IssueSpec } from '@agent-factory/domain';
import { checkPaths, FACTORY_WORK_DIRECTORY, type AcceptanceManifest } from '../../acceptance/acceptance-manifest.ts';
import type { Worktree } from '../../ports.ts';
import { checkRewriteCommitMessage } from '../conventional-commit.ts';
import { agentFailureSummary } from '../failure-summary.ts';
import { PIPELINE_EVENTS, type FileFingerprint, type FrozenRecord } from '../journal-events.ts';
import { EscalationRequiredError, MissingJournalFactError } from '../pipeline-errors.ts';
import { nextAttemptEpoch, type CheckRewriteProgress } from '../pipeline-journal.ts';
import { acceptanceAuthorValues, checkRewriteAddendum, withAddendum } from '../role-prompts.ts';
import { accessOf, describeOutcome, EXIT_CODE_SUCCESS, tailLines } from '../shell-commands.ts';
import { measureBeforeProof } from './before-proof-measurement.ts';
import { leasedWorktree, requireFrozen, requireManifest, requireSpec } from './journal-facts.ts';
import { ADVANCED, type PipelineStage, type StageContext, type StageResult } from './stage.ts';
import { issueTypeOfSpec, profileOf } from './stage-support.ts';

export const REWRITE_WORKSPACE_PREFIX = 'rewrite-issue-';
const SHA256 = 'sha256';
const HEX = 'hex';
const WORK_DIRECTORY_PREFIX = `${FACTORY_WORK_DIRECTORY}/`;

function isFactoryWork(path: string): boolean {
  return path === FACTORY_WORK_DIRECTORY || path.startsWith(WORK_DIRECTORY_PREFIX);
}

function requireRewrite(context: StageContext): CheckRewriteProgress {
  const rewrite = context.journal.checkRewrite;
  if (rewrite === null) throw new MissingJournalFactError(context.journal.issueNumber, 'check rewrite order');
  return rewrite;
}

async function fingerprintOf(context: StageContext, worktree: Worktree, paths: readonly string[]): Promise<readonly FileFingerprint[]> {
  const { files } = context.toolkit.dependencies;
  return Promise.all(
    [...new Set(paths)]
      .filter((path) => !isFactoryWork(path))
      .sort()
      .map(async (path) => {
        const content = await files.readText(worktree.path, path);
        return { path, sha256: content === null ? null : createHash(SHA256).update(content).digest(HEX) };
      }),
  );
}

export class CheckRewriteStage implements PipelineStage {
  readonly handles = ['rewriting-check'] as const;

  async advance(context: StageContext): Promise<StageResult> {
    const rewrite = requireRewrite(context);
    const worktree = await leasedWorktree(context);
    const path = rewrite.order.path;
    if (rewrite.fingerprint === null) {
      await this.assertOtherChecksFrozen(context, worktree, path);
      const changed = await context.toolkit.dependencies.sourceControl.changedFiles(worktree);
      await context.writer.record(PIPELINE_EVENTS.checkRewriteStarted, { path, fingerprint: await fingerprintOf(context, worktree, [...changed, path]) });
      return ADVANCED;
    }
    try {
      return await this.rewrite(context, worktree, rewrite, rewrite.fingerprint);
    } catch (error) {
      // A rewrite that ends without being frozen leaves the check as it was frozen, so that the next rewrite finds every frozen check intact.
      if (error instanceof EscalationRequiredError) await context.toolkit.dependencies.sourceControl.discardPaths(worktree, [path]);
      throw error;
    }
  }

  private async rewrite(context: StageContext, worktree: Worktree, rewrite: CheckRewriteProgress, fingerprint: readonly FileFingerprint[]): Promise<StageResult> {
    const { journal, writer } = context;
    const path = rewrite.order.path;
    if (rewrite.authored === null) {
      await this.author(context, worktree, rewrite);
      return ADVANCED;
    }
    if (rewrite.authored.outcome !== 'success') {
      throw new EscalationRequiredError(agentFailureSummary('acceptance-author', rewrite.authored.outcome, `the rewrite of ${path} did not finish`));
    }
    if (!rewrite.proved) {
      await this.assertLimitedToCheck(context, worktree, fingerprint, path);
      const beforeProof = await this.proveOnBase(context, worktree, requireSpec(journal), requireManifest(journal));
      await writer.record(PIPELINE_EVENTS.checkRewriteProved, { path, beforeProof });
      return ADVANCED;
    }
    const evaluation = journal.beforeProof?.evaluation;
    if (evaluation === undefined || !evaluation.valid) {
      throw new EscalationRequiredError(`the rewritten check ${path} is not valid on the base: ${evaluation?.valid === false ? evaluation.reason : 'no before proof'}`);
    }
    await this.refreeze(context, worktree, rewrite, requireFrozen(journal), requireManifest(journal));
    return ADVANCED;
  }

  private async assertOtherChecksFrozen(context: StageContext, worktree: Worktree, path: string): Promise<void> {
    const { files, sourceControl } = context.toolkit.dependencies;
    const others = requireFrozen(context.journal).checks.filter((check) => check.path !== path);
    const drifted: string[] = [];
    for (const check of others) {
      if (!(await files.exists(worktree.path, check.path))) {
        drifted.push(`${check.path} (missing)`);
        continue;
      }
      const [current] = await sourceControl.hashFiles(worktree, [check.path]);
      if (current?.sha256 !== check.sha256) drifted.push(`${check.path} (modified)`);
    }
    if (drifted.length > 0) {
      throw new EscalationRequiredError(
        `frozen checks other than ${path} no longer match their frozen content: ${drifted.join(', ')}; only the check the operator named is rewritten`,
      );
    }
  }

  private async author(context: StageContext, worktree: Worktree, rewrite: CheckRewriteProgress): Promise<void> {
    const { journal, writer, toolkit } = context;
    const { dependencies, settings } = toolkit;
    const spec = requireSpec(journal);
    const frozen = requireFrozen(journal);
    const path = rewrite.order.path;
    const profile = profileOf(context, 'acceptance-author');
    const current = (await dependencies.files.readText(worktree.path, path)) ?? '';
    const type = issueTypeOfSpec(context, spec);
    const rendered = dependencies.roles.render('acceptance-author', acceptanceAuthorValues(settings.repository, spec, type, toolkit.films !== null));
    const result = await toolkit.stacks.around(writer, journal.issueNumber, type.id, worktree.path, () =>
      toolkit.agents.run(writer, {
        role: 'acceptance-author',
        profile,
        model: profile.model,
        effort: profile.effort,
        workingDirectory: worktree.path,
        prompt: withAddendum(rendered, checkRewriteAddendum(path, rewrite.order.instruction, current)),
        resumeSessionId: null,
        frozenChecks: frozen.checks.filter((check) => check.path !== path),
        gateCommand: null,
        attempt: journal.checkRewrites.length,
        branch: journal.branch,
        decisionRequestPath: null,
      }),
    );
    await dependencies.files.remove(worktree.path, FACTORY_WORK_DIRECTORY);
    await writer.record(PIPELINE_EVENTS.checkRewriteAuthored, { path, runId: result.runId, sessionId: result.sessionId, outcome: result.outcome });
  }

  private async assertLimitedToCheck(context: StageContext, worktree: Worktree, before: readonly FileFingerprint[], path: string): Promise<void> {
    const changed = await context.toolkit.dependencies.sourceControl.changedFiles(worktree);
    const recorded = new Map(before.map((entry) => [entry.path, entry.sha256]));
    const after = await fingerprintOf(context, worktree, [...changed, ...recorded.keys(), path]);
    const outside = after.filter((entry) => entry.path !== path && (recorded.get(entry.path) ?? null) !== entry.sha256).map((entry) => entry.path);
    if (outside.length > 0) throw new EscalationRequiredError(`the acceptance-author changed files outside ${path}: ${outside.join(', ')}`);
    const target = after.find((entry) => entry.path === path);
    if (target?.sha256 === null || target === undefined) throw new EscalationRequiredError(`the acceptance-author deleted ${path}`);
    if (target.sha256 === (recorded.get(path) ?? null)) throw new EscalationRequiredError(`the acceptance-author left ${path} unchanged`);
  }

  private async proveOnBase(context: StageContext, worktree: Worktree, spec: IssueSpec, manifest: AcceptanceManifest) {
    const { dependencies, settings, shell } = context.toolkit;
    const workspace = await dependencies.baseWorkspaces.checkout(`${REWRITE_WORKSPACE_PREFIX}${context.journal.issueNumber}`, worktree.baseSha);
    try {
      for (const path of checkPaths(manifest)) {
        if (!(await dependencies.files.copyFile(worktree.path, path, workspace.path, path))) {
          throw new EscalationRequiredError(`the check ${path} is missing from the worktree`);
        }
      }
      for (const command of settings.setupCommands) {
        const outcome = await shell.execute(command.run, workspace.path, accessOf(command));
        if (outcome.kind === 'not-runnable' || outcome.exitCode !== EXIT_CODE_SUCCESS) {
          throw new EscalationRequiredError(`the base workspace setup failed at ${command.name}:\n${tailLines(describeOutcome(command.run, outcome))}`);
        }
      }
      return await measureBeforeProof(context, { path: workspace.path, branch: worktree.branch, baseSha: worktree.baseSha }, spec, manifest);
    } finally {
      await dependencies.baseWorkspaces.remove(workspace);
    }
  }

  private async refreeze(context: StageContext, worktree: Worktree, rewrite: CheckRewriteProgress, frozen: FrozenRecord, manifest: AcceptanceManifest): Promise<void> {
    const { journal, writer, toolkit } = context;
    const { sourceControl } = toolkit.dependencies;
    const path = rewrite.order.path;
    await this.assertOtherChecksFrozen(context, worktree, path);
    const checks = await sourceControl.hashFiles(worktree, checkPaths(manifest));
    const previous = frozen.checks.find((check) => check.path === path);
    const rewritten = checks.find((check) => check.path === path);
    if (previous === undefined || rewritten === undefined) throw new MissingJournalFactError(journal.issueNumber, `frozen check ${path}`);
    const commitSha = await sourceControl.commitPaths(worktree, [path], checkRewriteCommitMessage(requireSpec(journal), toolkit.settings.conventions, path));
    await writer.record(PIPELINE_EVENTS.checkRewritten, {
      path,
      instruction: rewrite.order.instruction,
      operator: rewrite.order.operator,
      previousSha256: previous.sha256,
      sha256: rewritten.sha256,
      checks,
      commitSha,
      nextAttempt: nextAttemptEpoch(journal),
    });
    await writer.transition('checks-frozen', `${rewrite.order.operator}'s rewrite of ${path} is frozen`);
  }
}
