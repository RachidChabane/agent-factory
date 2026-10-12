import { describe, expect, it } from 'vitest';
import { parseCommandLine, type CliCommand } from '../cli/command-line.ts';
import { createStartedIssue, issueStatus, mergePullRequest, runIssue, validateOffline } from './cli-commands.ts';

const SPEC_PATH = '/operator/category-filter.md';
const HEAD_SHA = '4961798ec085a3693f294496970c3b7926e925c8';

/** What the factory's own command line makes of the arguments. */
function commandOf(args: readonly string[]): CliCommand {
  const parsed = parseCommandLine(args);
  if (!parsed.ok) throw new Error(parsed.error);
  expect(parsed.line.project).toBeNull();
  return parsed.line.command;
}

describe('the factory commands of the example run', () => {
  it('validate the configuration without running any command', () => {
    expect(commandOf(validateOffline())).toEqual({ kind: 'validate', offline: true, gatePreflight: true });
  });

  it('create an issue from a spec file and validate it at once', () => {
    expect(commandOf(createStartedIssue(SPEC_PATH))).toEqual({ kind: 'issue-create', specPath: SPEC_PATH, blockedBy: [], confirmed: false, start: true });
  });

  it('run an issue to its pull request', () => {
    expect(commandOf(runIssue(1))).toEqual({ kind: 'run-issue', issueNumber: 1 });
  });

  it('merge a pull request at the reviewed head', () => {
    expect(commandOf(mergePullRequest(2, HEAD_SHA))).toEqual({ kind: 'merge', pullRequestNumber: 2, expectedHeadSha: HEAD_SHA });
  });

  it('read the status of an issue', () => {
    expect(commandOf(issueStatus(1))).toEqual({ kind: 'status', issueNumber: 1 });
  });
});
