import { FileLogArchive } from '@agent-factory/adapters';
import { EVIDENCE_DIRECTORY, evidenceDirectory } from '@agent-factory/application';
import { itemName } from '../cli/commands/project-session.ts';
import { issueStatus } from './cli-commands.ts';
import { STATUS_FIELDS, statusFields } from './cli-output.ts';
import { EXAMPLE_ISSUE, mergedFiles } from './example-story.ts';
import { expectContains, expectEqual, expectMatch, expectThat } from './expectations.ts';
import { expectSucceeded } from './factory-cli.ts';
import { joinItems, shortSha } from './format.ts';
import type { JourneyCollaborators, ReviewedPullRequest } from './journey-collaborators.ts';
import { ASSERTION_FAILURE_CODE, BEFORE_PROOF_LOG, failedTestCount } from './proof-log.ts';
import { PATH_SEPARATOR, pathsUnder } from './tree-paths.ts';

const MISSING = '(missing)';
const VALID_PROOF = /^valid\b/;

/** What the forge, the repository, the logs and `status` show once the pull request has been merged. */
export class MergeVerification {
  private readonly collaborators: JourneyCollaborators;

  constructor(collaborators: JourneyCollaborators) {
    this.collaborators = collaborators;
  }

  async verify(pullRequest: ReviewedPullRequest, mergeSha: string): Promise<void> {
    const { journal } = this.collaborators;
    const base = this.collaborators.world.project.baseBranch;
    await journal.step('pull request recorded as merged', () => this.recordedAsMerged(pullRequest, mergeSha), () => `#${pullRequest.number} as ${shortSha(mergeSha)}`);
    await journal.step('base branch at the merge commit', () => this.baseAtMergeCommit(pullRequest, mergeSha), (subject) => `${base} is ${shortSha(mergeSha)} "${subject}"`);
    await journal.step('base branch holds the change', () => this.baseHoldsChange(), (paths) => joinItems(paths));
    await journal.step('evidence gone from the base branch', () => this.evidenceGone(pullRequest), (removed) => `${removed} evidence files were on the reviewed head`);
    await journal.step('issue closed on the forge', () => this.issueClosed(pullRequest), () => this.issueName(pullRequest));
    const status = await journal.step('status reports the merge', () => this.statusReportsMerge(pullRequest, mergeSha), () => `State: merged, Merged as: ${shortSha(mergeSha)}`);
    await journal.step('pipeline gate passed', async () => this.pipelineGatePassed(status), (attempt) => attempt);
    await journal.step('frozen checks failed on the base by assertion', () => this.failedOnBaseByAssertion(pullRequest, status), (count) => `all ${count} checks failed`);
  }

  private async recordedAsMerged(pullRequest: ReviewedPullRequest, mergeSha: string): Promise<void> {
    const record = await this.collaborators.forge.pullRequest(pullRequest.number);
    const subject = `pull request #${pullRequest.number}`;
    expectEqual(`${subject} is merged on the forge`, 'merged', record.state);
    expectEqual(`the forge's merge commit of ${subject} is the one the merge command printed`, mergeSha, record.mergeSha ?? MISSING);
    expectThat(record.closes.includes(pullRequest.issue), `${subject} closes ${this.issueName(pullRequest)}`, `${pullRequest.issue} among the issues it closes`, joinItems(record.closes.map(String)));
  }

  private async baseAtMergeCommit(pullRequest: ReviewedPullRequest, mergeSha: string): Promise<string> {
    const { forge, repository, world } = this.collaborators;
    const base = world.project.baseBranch;
    expectEqual(`the ${base} branch points at the merge commit`, mergeSha, await repository.revision(base));
    const record = await forge.pullRequest(pullRequest.number);
    const subject = await repository.subject(base);
    expectEqual('the merge commit is the squash of the pull request, named by its title and number', `${record.title} (#${pullRequest.number})`, subject);
    return subject;
  }

  private async baseHoldsChange(): Promise<readonly string[]> {
    const { repository, world } = this.collaborators;
    const base = world.project.baseBranch;
    const paths = await repository.paths(base);
    const files = mergedFiles(EXAMPLE_ISSUE);
    for (const file of files) {
      expectThat(paths.includes(file.path), `${file.path} is in the tree of ${base}`, 'a path of the tree', joinItems(paths));
      expectEqual(`${file.path} on ${base} is what the agents wrote`, file.content, await repository.fileAt(base, file.path));
    }
    return files.map((file) => file.path);
  }

  private async evidenceGone(pullRequest: ReviewedPullRequest): Promise<number> {
    const { repository, world } = this.collaborators;
    const base = world.project.baseBranch;
    const onBase = pathsUnder(EVIDENCE_DIRECTORY, await repository.paths(base));
    expectThat(onBase.length === 0, `no evidence is left on ${base}`, `no path under ${EVIDENCE_DIRECTORY}${PATH_SEPARATOR}`, joinItems(onBase));
    return pathsUnder(evidenceDirectory(pullRequest.issue), await repository.paths(pullRequest.headSha)).length;
  }

  private async issueClosed(pullRequest: ReviewedPullRequest): Promise<void> {
    const issue = await this.collaborators.forge.issue(pullRequest.issue);
    expectEqual(`${this.issueName(pullRequest)} is closed on the forge`, 'closed', issue.state);
  }

  private async statusReportsMerge(pullRequest: ReviewedPullRequest, mergeSha: string): Promise<ReadonlyMap<string, string>> {
    const run = expectSucceeded(await this.collaborators.cli.run(issueStatus(pullRequest.issue)));
    const fields = statusFields(run.output);
    expectEqual('status reports the issue as merged', 'merged', fields.get(STATUS_FIELDS.state) ?? MISSING);
    expectEqual('status names the merge commit', mergeSha, fields.get(STATUS_FIELDS.mergedAs) ?? MISSING);
    return fields;
  }

  private pipelineGatePassed(status: ReadonlyMap<string, string>): string {
    const passed = `attempt ${EXAMPLE_ISSUE.attempts.length} passed`;
    expectEqual('status reports the gate of the pipeline as passed', passed, status.get(STATUS_FIELDS.lastGate) ?? MISSING);
    return passed;
  }

  private issueName(pullRequest: ReviewedPullRequest): string {
    return itemName(this.collaborators.world.project, pullRequest.issue);
  }

  private async failedOnBaseByAssertion(pullRequest: ReviewedPullRequest, status: ReadonlyMap<string, string>): Promise<number> {
    const { world } = this.collaborators;
    expectMatch('status reports the proof on the base as valid', VALID_PROOF, status.get(STATUS_FIELDS.beforeProof) ?? MISSING);
    const log = await new FileLogArchive(world.project.directories.logs).read(pullRequest.issue, BEFORE_PROOF_LOG);
    expectThat(log !== null, `the factory kept ${BEFORE_PROOF_LOG} of ${this.issueName(pullRequest)}`, 'a log', 'no such log');
    const text = log ?? '';
    expectContains(`${BEFORE_PROOF_LOG} shows the checks failing on an assertion`, ASSERTION_FAILURE_CODE, text);
    const criteria = EXAMPLE_ISSUE.spec.acceptanceCriteria.length;
    expectEqual(`${BEFORE_PROOF_LOG} shows every check of the ${criteria} criteria failing`, criteria, failedTestCount(text));
    return criteria;
  }
}
