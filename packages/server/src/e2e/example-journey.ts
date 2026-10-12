import { ACCEPTANCE_TESTS_FILE, AFTER_LOG_FILE, BEFORE_LOG_FILE, DIFF_STAT_FILE, evidenceDirectory } from '@agent-factory/application';
import { itemName } from '../cli/commands/project-session.ts';
import { createStartedIssue, mergePullRequest, runIssue, validateOffline } from './cli-commands.ts';
import { createdIssueNumber, mergedPullRequest, openedPullRequest, validationFailures } from './cli-output.ts';
import { EXAMPLE_ISSUE, mergedFiles, renderSpecDocument } from './example-story.ts';
import { expectEqual, expectIncludesAll, expectMatch, expectThat } from './expectations.ts';
import { expectSucceeded } from './factory-cli.ts';
import { joinItems, shortSha } from './format.ts';
import type { JourneyCollaborators, ReviewedPullRequest } from './journey-collaborators.ts';
import { MergeVerification } from './merge-verification.ts';
import { PATH_SEPARATOR, pathsUnder } from './tree-paths.ts';

const SPEC_FILE_EXTENSION = '.md';
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;
const EVIDENCE_BUNDLE_FILES: readonly string[] = [ACCEPTANCE_TESTS_FILE, AFTER_LOG_FILE, BEFORE_LOG_FILE, DIFF_STAT_FILE];

/**
 * The storefront's category filter, from its spec to a merged pull request, through the factory's
 * command line: what an operator types, in the order they type it.
 */
export class ExampleJourney {
  private readonly collaborators: JourneyCollaborators;
  private readonly mergeVerification: MergeVerification;

  constructor(collaborators: JourneyCollaborators) {
    this.collaborators = collaborators;
    this.mergeVerification = new MergeVerification(collaborators);
  }

  async run(): Promise<void> {
    await this.validateConfiguration();
    const specPath = await this.writeSpec();
    await this.baseBranchLacksChange();
    const issue = await this.createIssue(specPath);
    const pullRequest = await this.openPullRequest(issue);
    await this.evidenceOnReviewedHead(pullRequest);
    const mergeSha = await this.merge(pullRequest);
    await this.mergeVerification.verify(pullRequest, mergeSha);
  }

  private validateConfiguration(): Promise<void> {
    const { journal, cli } = this.collaborators;
    return journal.step('configuration validated offline', async () => {
      const run = expectSucceeded(await cli.run(validateOffline()));
      const failures = validationFailures(run.output);
      expectThat(failures.length === 0, 'validation reports no failed required check', 'no line that starts with FAIL', failures.join('\n'));
    });
  }

  private writeSpec(): Promise<string> {
    const { journal, world, conventions } = this.collaborators;
    const { spec, key } = EXAMPLE_ISSUE;
    return journal.step(
      'spec written',
      () => world.writeOperatorFile(`${key}${SPEC_FILE_EXTENSION}`, renderSpecDocument(EXAMPLE_ISSUE, conventions)),
      () => `"${spec.title}" with ${spec.acceptanceCriteria.length} acceptance criteria`,
    );
  }

  private baseBranchLacksChange(): Promise<readonly string[]> {
    const { journal, repository, world } = this.collaborators;
    const base = world.project.baseBranch;
    return journal.step(
      'base branch lacks the change',
      async () => {
        const paths = await repository.paths(base);
        const files = mergedFiles(EXAMPLE_ISSUE).map((file) => file.path);
        const present = files.filter((path) => paths.includes(path));
        expectThat(present.length === 0, `${base} holds none of the files the change adds`, 'none of them', joinItems(present));
        return files;
      },
      (files) => `${joinItems(files)} not on ${base}`,
    );
  }

  private createIssue(specPath: string): Promise<number> {
    const { journal, cli, forge, conventions, world } = this.collaborators;
    return journal.step(
      'issue created',
      async () => {
        const number = createdIssueNumber(expectSucceeded(await cli.run(createStartedIssue(specPath))).output);
        const issue = await forge.issue(number);
        const name = itemName(world.project, number);
        expectEqual(`${name} is open on the forge`, 'open', issue.state);
        expectEqual(`${name} has the title of the spec`, EXAMPLE_ISSUE.spec.title, issue.title);
        expectThat(issue.labels.includes(conventions.labels.validated), `${name} is validated, so the factory can take it`, `the label ${conventions.labels.validated}`, joinItems(issue.labels));
        return number;
      },
      (number) => itemName(world.project, number),
    );
  }

  private openPullRequest(issue: number): Promise<ReviewedPullRequest> {
    const { journal, cli, forge, repository, world } = this.collaborators;
    return journal.step(
      'pull request opened',
      async () => {
        const opened = openedPullRequest(expectSucceeded(await cli.run(runIssue(issue))).output);
        expectEqual('the pull request opened is for the issue that was run', issue, opened.issue);
        const record = await forge.pullRequest(opened.pullRequest);
        const name = `pull request #${opened.pullRequest}`;
        expectEqual(`${name} is open on the forge`, 'open', record.state);
        expectEqual(`${name} is against the base branch`, world.project.baseBranch, record.base);
        expectThat(record.closes.includes(issue), `${name} closes ${itemName(world.project, issue)}`, `${issue} among the issues it closes`, joinItems(record.closes.map(String)));
        const headSha = await repository.revision(record.head);
        expectMatch(`the head of ${name} is a full commit sha`, FULL_COMMIT_SHA, headSha);
        return { issue, number: opened.pullRequest, branch: record.head, headSha };
      },
      (pullRequest) => `#${pullRequest.number} on ${pullRequest.branch} at ${shortSha(pullRequest.headSha)}`,
    );
  }

  private evidenceOnReviewedHead(pullRequest: ReviewedPullRequest): Promise<readonly string[]> {
    const { journal, repository } = this.collaborators;
    const directory = evidenceDirectory(pullRequest.issue);
    return journal.step(
      'evidence on the reviewed head',
      async () => {
        const names = pathsUnder(directory, await repository.paths(pullRequest.headSha));
        expectIncludesAll(`the reviewed head carries the evidence bundle in ${directory}`, EVIDENCE_BUNDLE_FILES, names);
        return names;
      },
      (names) => `${directory}${PATH_SEPARATOR} holds ${joinItems(names)}`,
    );
  }

  private merge(pullRequest: ReviewedPullRequest): Promise<string> {
    const { journal, cli } = this.collaborators;
    return journal.step(
      'pull request merged',
      async () => {
        const merged = mergedPullRequest(expectSucceeded(await cli.run(mergePullRequest(pullRequest.number, pullRequest.headSha))).output);
        expectEqual('the merge is of the pull request that was ordered', pullRequest.number, merged.pullRequest);
        expectEqual('the merge is for the issue the pull request closes', pullRequest.issue, merged.issue);
        return merged.mergeSha;
      },
      (mergeSha) => `#${pullRequest.number} as ${shortSha(mergeSha)}`,
    );
  }
}
