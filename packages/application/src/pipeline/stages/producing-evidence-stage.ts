import type { IssueSpec } from '@agent-factory/domain';
import { criterionChecksOf, EVIDENCE_PREFIX } from '../../acceptance/acceptance-manifest.ts';
import { targetedScore } from '../../acceptance/score-report.ts';
import type { PullRequestRef, Worktree } from '../../ports.ts';
import { evidenceCommitMessage, implementationCommitMessage, pullRequestTitle } from '../conventional-commit.ts';
import { acceptanceTestRows, type AcceptanceTestRow } from '../acceptance-test-table.ts';
import { renderDiffStat } from '../diff-stat.ts';
import { evidenceIsComplete } from '../evidence.ts';
import { PIPELINE_EVENTS, type EvidenceRecord } from '../journal-events.ts';
import { EscalationRequiredError } from '../pipeline-errors.ts';
import { OutboundSecretScan } from '../outbound-secret-scan.ts';
import { attemptCounts, currentAttempt, gateRecord, reviewRecord, totalCostUsd, type PipelineJournal } from '../pipeline-journal.ts';
import {
  leasedWorktree,
  requireBeforeProof,
  requireBranch,
  requireFact,
  requireFrozen,
  requireManifest,
  requireSpec,
} from './journal-facts.ts';
import { PULL_REQUEST_OPENED_EVENT, pullRequestSubject } from '../../release/events.ts';
import { ADVANCED, type PipelineStage, type StageContext, type StageResult } from './stage.ts';
import { changeStat } from './stage-support.ts';

const FIRST_SEQUENCE = 0;
const NEWLINE = '\n';

function firstLine(text: string): string {
  return text.trim().split(NEWLINE)[0] ?? '';
}

function acceptanceTestsOf(journal: PipelineJournal): readonly AcceptanceTestRow[] {
  const gate = gateRecord(journal, currentAttempt(journal));
  return acceptanceTestRows(requireBeforeProof(journal).tests, gate?.tests ?? [], criterionChecksOf(journal.manifest));
}

function secretScan(context: StageContext): OutboundSecretScan {
  return new OutboundSecretScan(context.toolkit.dependencies.knownSecrets);
}

export class ProducingEvidenceStage implements PipelineStage {
  readonly handles = ['producing-evidence'] as const;

  async advance(context: StageContext): Promise<StageResult> {
    const { journal, writer } = context;
    const spec = requireSpec(journal);
    const worktree = await leasedWorktree(context);
    if (journal.implementationCommit === null) {
      await this.commitImplementation(context, worktree, spec);
      return ADVANCED;
    }
    if (journal.evidence === null) {
      await this.commitEvidence(context, worktree, spec);
      return ADVANCED;
    }
    if (journal.pushedHead !== journal.evidence.sha) {
      const { sourceControl } = context.toolkit.dependencies;
      const body = await this.renderBody(context, worktree, spec, journal.evidence);
      await secretScan(context).assertClean({ diff: await sourceControl.diff(worktree), body }, `push ${requireBranch(journal)}`);
      await sourceControl.push(worktree);
      await writer.record(PIPELINE_EVENTS.branchPushed, { headSha: journal.evidence.sha });
      return ADVANCED;
    }
    if (journal.pullRequest === null) {
      const pullRequest = await this.openPullRequest(context, worktree, spec, journal.evidence);
      await this.announcePullRequest(context, pullRequest, journal.evidence);
      await writer.record(PIPELINE_EVENTS.pullRequestOpened, pullRequest);
      return ADVANCED;
    }
    if (journal.pullRequestBodySha !== journal.evidence.sha) {
      const body = await this.renderBody(context, worktree, spec, journal.evidence);
      await secretScan(context).assertClean({ body }, `update the body of pull request #${journal.pullRequest.number}`);
      await context.toolkit.dependencies.github.updatePullRequestBody(journal.pullRequest.number, body);
      await writer.record(PIPELINE_EVENTS.pullRequestUpdated, { headSha: journal.evidence.sha });
      return ADVANCED;
    }
    const verb = journal.feedback.length === 0 ? 'opened' : 'updated';
    await writer.transition('pr-open', `pull request #${journal.pullRequest.number} ${verb}`);
    return ADVANCED;
  }

  private async commitImplementation(context: StageContext, worktree: Worktree, spec: IssueSpec): Promise<void> {
    const { journal, writer, toolkit } = context;
    const { sourceControl } = toolkit.dependencies;
    if (!(await sourceControl.isClean(worktree))) {
      await sourceControl.commitAll(worktree, implementationCommitMessage(spec, toolkit.settings.conventions, await sourceControl.changedFiles(worktree)));
    }
    const frozen = new Set(requireFrozen(journal).checks.map((check) => check.path));
    const implementation = (await sourceControl.changedFiles(worktree)).filter((path) => !frozen.has(path) && !path.startsWith(EVIDENCE_PREFIX));
    if (implementation.length === 0) throw new EscalationRequiredError('the implementation changed nothing beyond the frozen checks');
    const sha = await sourceControl.headSha(worktree);
    await writer.record(PIPELINE_EVENTS.implementationCommitted, { sha });
  }

  private async commitEvidence(context: StageContext, worktree: Worktree, spec: IssueSpec): Promise<void> {
    const { journal, writer, toolkit } = context;
    const { sourceControl, logs } = toolkit.dependencies;
    const beforeProof = requireBeforeProof(journal);
    const gate = requireFact(journal, gateRecord(journal, currentAttempt(journal)), 'passing gate');
    const stat = changeStat(await sourceControl.diff(worktree));
    const bundle = await toolkit.evidence.writeBundle(worktree, journal.issueNumber, {
      before: beforeProof.evidence,
      after: gate.evidence,
      beforeLog: beforeProof.logName === null ? null : await logs.read(journal.issueNumber, beforeProof.logName),
      afterLog: (await logs.read(journal.issueNumber, gate.logName)) ?? '',
      diffStat: renderDiffStat(stat),
      acceptanceTests: acceptanceTestRows(beforeProof.tests, gate.tests, criterionChecksOf(journal.manifest)),
    });
    if (!(await sourceControl.isClean(worktree))) await sourceControl.commitAll(worktree, evidenceCommitMessage(spec));
    const committed = toolkit.evidence.keepCommitted(bundle, await sourceControl.changedFiles(worktree));
    await writer.record(PIPELINE_EVENTS.evidenceCommitted, { sha: await sourceControl.headSha(worktree), bundle: committed, changes: stat });
  }

  private async announcePullRequest(context: StageContext, pullRequest: PullRequestRef, evidence: EvidenceRecord): Promise<void> {
    const { events } = context.toolkit.dependencies;
    const subject = pullRequestSubject(pullRequest.number);
    const announced = (await events.read(subject, FIRST_SEQUENCE)).some(
      (event) => event.subject === subject && event.type === PULL_REQUEST_OPENED_EVENT,
    );
    if (announced) return;
    await events.append(PULL_REQUEST_OPENED_EVENT, subject, {
      number: pullRequest.number,
      evidenceComplete: evidenceIsComplete(evidence.bundle),
      issueNumber: context.journal.issueNumber,
      headSha: pullRequest.headSha,
    });
  }

  private async openPullRequest(context: StageContext, worktree: Worktree, spec: IssueSpec, evidence: EvidenceRecord): Promise<PullRequestRef> {
    const { journal, toolkit } = context;
    const { github, sourceControl } = toolkit.dependencies;
    const branch = requireBranch(journal);
    const existing = await github.findOpenPullRequest(branch);
    if (existing !== null) return existing;
    const title = pullRequestTitle(spec, toolkit.settings.conventions, await sourceControl.changedFiles(worktree));
    const body = await this.renderBody(context, worktree, spec, evidence);
    await secretScan(context).assertClean({ title, body }, `open a pull request for ${branch}`);
    return github.openPullRequest({ branch, title, body, labels: [toolkit.settings.conventions.labels.factory, toolkit.settings.conventions.typology.get(spec.type).label], closes: [spec.number] });
  }

  private async renderBody(context: StageContext, worktree: Worktree, spec: IssueSpec, evidence: EvidenceRecord): Promise<string> {
    const { journal, toolkit } = context;
    const branch = requireBranch(journal);
    const attempt = currentAttempt(journal);
    const gate = requireFact(journal, gateRecord(journal, attempt), 'passing gate');
    const review = requireFact(journal, reviewRecord(journal, attempt), 'review');
    return toolkit.bodies.render({
      fileLinks: toolkit.settings.fileLinks,
      spec,
      branch,
      baseSha: worktree.baseSha,
      evidenceSha: evidence.sha,
      manifest: requireManifest(journal),
      frozenChecks: requireFrozen(journal).checks,
      beforeProof: requireBeforeProof(journal),
      gate: gate.result,
      afterScore: gate.scoreReport === null ? null : targetedScore(gate.scoreReport),
      bundle: evidence.bundle,
      diffStat: changeStat(await toolkit.dependencies.sourceControl.diff(worktree)),
      reviewFindings: review.findings,
      attempts: attemptCounts(journal),
      costUsd: totalCostUsd(journal),
      externalFeedback: journal.feedback.map((feedback) => ({ author: feedback.author, summary: firstLine(feedback.body) })),
      acceptanceTests: acceptanceTestsOf(journal),
      filmSection: (await toolkit.films?.sectionFor(journal)) ?? null,
    });
  }
}
