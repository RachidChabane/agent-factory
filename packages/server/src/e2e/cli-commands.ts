import { COMMAND_NAMES, EXPECTED_HEAD_OPTION, ISSUE_SUBCOMMANDS, NOW_FLAG, OFFLINE_FLAG, START_FLAG } from '../cli/command-line.ts';

/** The arguments of each factory command the example run gives, spelled with the command line's own vocabulary. */

export function validateOffline(): readonly string[] {
  return [COMMAND_NAMES.validate, OFFLINE_FLAG];
}

export function createStartedIssue(specPath: string): readonly string[] {
  return [COMMAND_NAMES.issue, ISSUE_SUBCOMMANDS.create, specPath, START_FLAG];
}

export function runIssue(issueNumber: number): readonly string[] {
  return [COMMAND_NAMES.runIssue, String(issueNumber)];
}

export function mergePullRequest(pullRequestNumber: number, expectedHeadSha: string): readonly string[] {
  return [COMMAND_NAMES.merge, String(pullRequestNumber), EXPECTED_HEAD_OPTION, expectedHeadSha];
}

export function issueStatus(issueNumber: number): readonly string[] {
  return [COMMAND_NAMES.status, String(issueNumber)];
}

export function startFactory(): readonly string[] {
  return [COMMAND_NAMES.start];
}

export function stopFactoryNow(): readonly string[] {
  return [COMMAND_NAMES.stop, NOW_FLAG];
}
