import { parseLabelList } from '@agent-factory/application';

export const COMMAND_NAMES = {
  runIssue: 'run-issue',
  resume: 'resume',
  merge: 'merge',
  status: 'status',
  validate: 'validate',
  rehearsal: 'rehearsal',
  start: 'start',
  request: 'request',
  issue: 'issue',
  pr: 'pr',
  audit: 'audit',
  help: 'help',
} as const;

export const REQUEST_SUBCOMMANDS = {
  add: 'add',
  challenge: 'challenge',
} as const;

export const ISSUE_SUBCOMMANDS = {
  create: 'create',
  abandon: 'abandon',
} as const;

export const PR_SUBCOMMANDS = {
  feedback: 'feedback',
} as const;

export const IMAGES_OPTION = '--images';
export const REQUESTER_OPTION = '--requester';
export const CONFIRM_FLAG = '--confirm';
export const AUTHOR_OPTION = '--author';
export const DEFAULT_REQUESTER = 'unknown';

export const REHEARSAL_SUBCOMMANDS = {
  init: 'init',
  reset: 'reset',
  addIssue: 'add-issue',
} as const;

export const EXPECTED_HEAD_OPTION = '--expected-head';
export const LABELS_OPTION = '--labels';
export const ANSWER_OPTION = '--answer';
export const REASON_OPTION = '--reason';
export const SKIP_GATE_PREFLIGHT_FLAG = '--skip-gate-preflight';
const OPTION_VALUE_SEPARATOR = '=';
const HELP_FLAGS: readonly string[] = ['-h', '--help'];
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const COMMIT_REFERENCE = /^[0-9a-f]{7,40}$/;
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;

export const USAGE = [
  'Usage: factory <command>',
  '',
  'Commands:',
  '  run-issue <issue>                            drive a validated issue to an open pull request, resuming where it stopped',
  '  resume <issue> [--answer <text>]             operator order after an escalation: return the issue to the stage it left, re-reading a spec whose checks are not frozen yet;',
  '                                               --answer carries the decision the implementer asked for',
  '  merge <pull-request> --expected-head <sha>   operator order: remove the evidence and squash-merge the reviewed head (full sha)',
  '  status <issue>                               show the state of an issue from the event log',
  '  validate [--skip-gate-preflight]             check the configuration and every tool the factory depends on, then run each setup',
  '                                               and gate command on a clean base workspace under the gate sandbox',
  '  rehearsal init <source-clone>                github.mode local: mirror the source clone into a local bare remote and clone it at target.clonePath',
  '  rehearsal reset <source-clone>               github.mode local: reset the base branch of the local remote and its clone to the source clone\'s, dropping merged rehearsal pull requests',
  '  rehearsal add-issue <spec.md> [--labels a,b] github.mode local: create a local issue from a spec file (Title:, Labels:, then the four sections)',
  '  start                                        run the factory: schedule validated issues, watch merges and releases, serve the cockpit',
  '  request add <file> [--images <dir>] [--requester <name>]  store a product request with its images',
  '  request challenge <id>                       challenge a stored request and draft its specs, report and reply',
  '  issue create <spec.md> [--confirm]           create an issue from a spec file; on GitHub it needs --confirm',
  '  issue abandon <issue> --reason <text>        operator order after an escalation: stop the factory work on the issue and free its worktree;',
  '                                               the issue and its branch stay as they are on the tracker',
  '  audit <commit> [<commit>...]                 record an on-demand audit for each commit of the base branch and run the auditor on them one at a time',
  '  pr feedback <pull-request> <file> --author <name>  record review feedback as blocking findings and start a new cycle',
].join('\n');

export type CliCommand =
  | { readonly kind: 'run-issue'; readonly issueNumber: number }
  | { readonly kind: 'resume'; readonly issueNumber: number; readonly answer: string | null }
  | { readonly kind: 'merge'; readonly pullRequestNumber: number; readonly expectedHeadSha: string }
  | { readonly kind: 'status'; readonly issueNumber: number }
  | { readonly kind: 'validate'; readonly gatePreflight: boolean }
  | { readonly kind: 'rehearsal-init'; readonly sourceClonePath: string }
  | { readonly kind: 'rehearsal-reset'; readonly sourceClonePath: string }
  | { readonly kind: 'rehearsal-add-issue'; readonly specPath: string; readonly labels: readonly string[] }
  | { readonly kind: 'start' }
  | { readonly kind: 'request-add'; readonly path: string; readonly imagesDirectory: string | null; readonly requester: string }
  | { readonly kind: 'request-challenge'; readonly requestId: string }
  | { readonly kind: 'issue-create'; readonly specPath: string; readonly confirmed: boolean }
  | { readonly kind: 'issue-abandon'; readonly issueNumber: number; readonly reason: string }
  | { readonly kind: 'pr-feedback'; readonly pullRequestNumber: number; readonly path: string; readonly author: string }
  | { readonly kind: 'audit'; readonly commits: readonly string[] }
  | { readonly kind: 'help' };

function parseValidate(rest: readonly string[]): ParsedCommandLine {
  const unexpected = rest.filter((argument) => argument !== SKIP_GATE_PREFLIGHT_FLAG);
  if (unexpected.length > 0) return { ok: false, error: `unexpected arguments: ${unexpected.join(' ')}` };
  return { ok: true, command: { kind: 'validate', gatePreflight: !rest.includes(SKIP_GATE_PREFLIGHT_FLAG) } };
}

export type ParsedCommandLine = { readonly ok: true; readonly command: CliCommand } | { readonly ok: false; readonly error: string };

function failure(error: string): ParsedCommandLine {
  return { ok: false, error };
}

function positiveInteger(value: string | undefined, what: string): number | string {
  if (value === undefined) return `missing ${what}`;
  return POSITIVE_INTEGER.test(value) ? Number(value) : `${what} must be a positive integer, got "${value}"`;
}

function single(rest: readonly string[], what: string, build: (value: number) => CliCommand): ParsedCommandLine {
  if (rest.length > 1) return failure(`unexpected arguments: ${rest.slice(1).join(' ')}`);
  const value = positiveInteger(rest[0], what);
  return typeof value === 'string' ? failure(value) : { ok: true, command: build(value) };
}

type SplitArguments =
  | { readonly ok: true; readonly positional: readonly string[]; readonly value: string | undefined }
  | { readonly ok: false; readonly error: string };

function splitOption(rest: readonly string[], option: string): SplitArguments {
  let value: string | undefined;
  const positional: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] ?? '';
    if (argument === option) {
      value = rest[index + 1];
      index += 1;
    } else if (argument.startsWith(`${option}${OPTION_VALUE_SEPARATOR}`)) {
      value = argument.slice(option.length + OPTION_VALUE_SEPARATOR.length);
    } else if (argument.startsWith('-')) {
      return { ok: false, error: `unknown option ${argument}` };
    } else {
      positional.push(argument);
    }
  }
  return { ok: true, positional, value };
}

interface ParsedOptions {
  readonly positional: readonly string[];
  readonly values: ReadonlyMap<string, string>;
  readonly flags: ReadonlySet<string>;
}

type OptionParse = { readonly ok: true; readonly options: ParsedOptions } | { readonly ok: false; readonly error: string };

function parseOptions(rest: readonly string[], valueOptions: readonly string[], flagOptions: readonly string[]): OptionParse {
  const positional: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] ?? '';
    const separator = argument.indexOf(OPTION_VALUE_SEPARATOR);
    const name = separator === -1 ? argument : argument.slice(0, separator);
    const inline = separator === -1 ? undefined : argument.slice(separator + OPTION_VALUE_SEPARATOR.length);
    if (valueOptions.includes(name)) {
      const value = inline ?? rest[index + 1];
      if (value === undefined || value === '') return { ok: false, error: `missing value for ${name}` };
      values.set(name, value);
      if (inline === undefined) index += 1;
    } else if (flagOptions.includes(argument)) {
      flags.add(argument);
    } else if (argument.startsWith('-')) {
      return { ok: false, error: `unknown option ${argument}` };
    } else {
      positional.push(argument);
    }
  }
  return { ok: true, options: { positional, values, flags } };
}

function exactly(positional: readonly string[], names: readonly string[]): string | null {
  if (positional.length < names.length) return `missing ${names[positional.length] ?? 'argument'}`;
  if (positional.length > names.length) return `unexpected arguments: ${positional.slice(names.length).join(' ')}`;
  return null;
}

function parseRequest(rest: readonly string[]): ParsedCommandLine {
  const [subcommand, ...subcommandArguments] = rest;
  switch (subcommand) {
    case REQUEST_SUBCOMMANDS.add: {
      const parsed = parseOptions(subcommandArguments, [IMAGES_OPTION, REQUESTER_OPTION], []);
      if (!parsed.ok) return failure(parsed.error);
      const problem = exactly(parsed.options.positional, ['request file']);
      if (problem !== null) return failure(problem);
      return {
        ok: true,
        command: {
          kind: 'request-add',
          path: parsed.options.positional[0] ?? '',
          imagesDirectory: parsed.options.values.get(IMAGES_OPTION) ?? null,
          requester: parsed.options.values.get(REQUESTER_OPTION) ?? DEFAULT_REQUESTER,
        },
      };
    }
    case REQUEST_SUBCOMMANDS.challenge: {
      const problem = exactly(subcommandArguments, ['request id']);
      if (problem !== null) return failure(problem);
      return { ok: true, command: { kind: 'request-challenge', requestId: subcommandArguments[0] ?? '' } };
    }
    default:
      return failure(subcommand === undefined ? 'missing request subcommand' : `unknown request subcommand "${subcommand}"`);
  }
}

function parseIssueCreate(rest: readonly string[]): ParsedCommandLine {
  const parsed = parseOptions(rest, [], [CONFIRM_FLAG]);
  if (!parsed.ok) return failure(parsed.error);
  const problem = exactly(parsed.options.positional, ['spec file']);
  if (problem !== null) return failure(problem);
  return { ok: true, command: { kind: 'issue-create', specPath: parsed.options.positional[0] ?? '', confirmed: parsed.options.flags.has(CONFIRM_FLAG) } };
}

function parseIssueAbandon(rest: readonly string[]): ParsedCommandLine {
  const parsed = parseOptions(rest, [REASON_OPTION], []);
  if (!parsed.ok) return failure(parsed.error);
  const problem = exactly(parsed.options.positional, ['issue number']);
  if (problem !== null) return failure(problem);
  const issueNumber = positiveInteger(parsed.options.positional[0], 'issue number');
  if (typeof issueNumber === 'string') return failure(issueNumber);
  const reason = parsed.options.values.get(REASON_OPTION)?.trim() ?? '';
  if (reason === '') return failure(`missing ${REASON_OPTION} <text>`);
  return { ok: true, command: { kind: 'issue-abandon', issueNumber, reason } };
}

function parseIssue(rest: readonly string[]): ParsedCommandLine {
  const [subcommand, ...subcommandArguments] = rest;
  switch (subcommand) {
    case ISSUE_SUBCOMMANDS.create:
      return parseIssueCreate(subcommandArguments);
    case ISSUE_SUBCOMMANDS.abandon:
      return parseIssueAbandon(subcommandArguments);
    default:
      return failure(subcommand === undefined ? 'missing issue subcommand' : `unknown issue subcommand "${subcommand}"`);
  }
}

function parsePullRequest(rest: readonly string[]): ParsedCommandLine {
  const [subcommand, ...subcommandArguments] = rest;
  if (subcommand !== PR_SUBCOMMANDS.feedback) {
    return failure(subcommand === undefined ? 'missing pr subcommand' : `unknown pr subcommand "${subcommand}"`);
  }
  const parsed = parseOptions(subcommandArguments, [AUTHOR_OPTION], []);
  if (!parsed.ok) return failure(parsed.error);
  const problem = exactly(parsed.options.positional, ['pull request number', 'feedback file']);
  if (problem !== null) return failure(problem);
  const pullRequestNumber = positiveInteger(parsed.options.positional[0], 'pull request number');
  if (typeof pullRequestNumber === 'string') return failure(pullRequestNumber);
  const author = parsed.options.values.get(AUTHOR_OPTION);
  if (author === undefined) return failure(`missing ${AUTHOR_OPTION} <name>`);
  return { ok: true, command: { kind: 'pr-feedback', pullRequestNumber, path: parsed.options.positional[1] ?? '', author } };
}

function sourceCloneCommand(rest: readonly string[], build: (sourceClonePath: string) => CliCommand): ParsedCommandLine {
  const [sourceClonePath, ...extra] = rest;
  if (sourceClonePath === undefined) return failure('missing source clone path');
  if (extra.length > 0) return failure(`unexpected arguments: ${extra.join(' ')}`);
  return { ok: true, command: build(sourceClonePath) };
}

function parseRehearsal(rest: readonly string[]): ParsedCommandLine {
  const [subcommand, ...subcommandArguments] = rest;
  switch (subcommand) {
    case REHEARSAL_SUBCOMMANDS.init:
      return sourceCloneCommand(subcommandArguments, (sourceClonePath) => ({ kind: 'rehearsal-init', sourceClonePath }));
    case REHEARSAL_SUBCOMMANDS.reset:
      return sourceCloneCommand(subcommandArguments, (sourceClonePath) => ({ kind: 'rehearsal-reset', sourceClonePath }));
    case REHEARSAL_SUBCOMMANDS.addIssue: {
      const split = splitOption(subcommandArguments, LABELS_OPTION);
      if (!split.ok) return failure(split.error);
      const [specPath, ...extra] = split.positional;
      if (specPath === undefined) return failure('missing spec file');
      if (extra.length > 0) return failure(`unexpected arguments: ${extra.join(' ')}`);
      return { ok: true, command: { kind: 'rehearsal-add-issue', specPath, labels: parseLabelList(split.value ?? '') } };
    }
    default:
      return failure(subcommand === undefined ? 'missing rehearsal subcommand' : `unknown rehearsal subcommand "${subcommand}"`);
  }
}

function parseResume(rest: readonly string[]): ParsedCommandLine {
  if (rest.at(-1) === ANSWER_OPTION) return failure(`missing text after ${ANSWER_OPTION}`);
  const split = splitOption(rest, ANSWER_OPTION);
  if (!split.ok) return failure(split.error);
  const { positional, value: answer } = split;
  if (positional.length > 1) return failure(`unexpected arguments: ${positional.slice(1).join(' ')}`);
  const issueNumber = positiveInteger(positional[0], 'issue number');
  if (typeof issueNumber === 'string') return failure(issueNumber);
  if (answer !== undefined && answer.trim() === '') return failure(`${ANSWER_OPTION} needs the text of the answer`);
  return { ok: true, command: { kind: 'resume', issueNumber, answer: answer ?? null } };
}

function parseMerge(rest: readonly string[]): ParsedCommandLine {
  const split = splitOption(rest, EXPECTED_HEAD_OPTION);
  if (!split.ok) return failure(split.error);
  const { positional, value: expectedHeadSha } = split;
  if (positional.length > 1) return failure(`unexpected arguments: ${positional.slice(1).join(' ')}`);
  const pullRequestNumber = positiveInteger(positional[0], 'pull request number');
  if (typeof pullRequestNumber === 'string') return failure(pullRequestNumber);
  if (expectedHeadSha === undefined) return failure(`missing ${EXPECTED_HEAD_OPTION} <sha>`);
  if (!FULL_COMMIT_SHA.test(expectedHeadSha)) {
    return failure(`${EXPECTED_HEAD_OPTION} must be the full 40-character commit sha, got "${expectedHeadSha}"`);
  }
  return { ok: true, command: { kind: 'merge', pullRequestNumber, expectedHeadSha } };
}

function parseAudit(rest: readonly string[]): ParsedCommandLine {
  const parsed = parseOptions(rest, [], []);
  if (!parsed.ok) return failure(parsed.error);
  const commits = parsed.options.positional;
  const invalid = commits.find((commit) => !COMMIT_REFERENCE.test(commit));
  if (commits.length === 0) return failure('missing commit');
  if (invalid !== undefined) return failure(`commit must be a hexadecimal sha of 7 to 40 characters, got "${invalid}"`);
  return { ok: true, command: { kind: 'audit', commits } };
}

export function parseCommandLine(argv: readonly string[]): ParsedCommandLine {
  const [name, ...rest] = argv;
  if (name === undefined || name === COMMAND_NAMES.help || HELP_FLAGS.includes(name)) return { ok: true, command: { kind: 'help' } };
  switch (name) {
    case COMMAND_NAMES.runIssue:
      return single(rest, 'issue number', (issueNumber) => ({ kind: 'run-issue', issueNumber }));
    case COMMAND_NAMES.resume:
      return parseResume(rest);
    case COMMAND_NAMES.status:
      return single(rest, 'issue number', (issueNumber) => ({ kind: 'status', issueNumber }));
    case COMMAND_NAMES.merge:
      return parseMerge(rest);
    case COMMAND_NAMES.rehearsal:
      return parseRehearsal(rest);
    case COMMAND_NAMES.validate:
      return parseValidate(rest);
    case COMMAND_NAMES.start:
      return rest.length === 0 ? { ok: true, command: { kind: 'start' } } : failure(`unexpected arguments: ${rest.join(' ')}`);
    case COMMAND_NAMES.request:
      return parseRequest(rest);
    case COMMAND_NAMES.issue:
      return parseIssue(rest);
    case COMMAND_NAMES.pr:
      return parsePullRequest(rest);
    case COMMAND_NAMES.audit:
      return parseAudit(rest);
    default:
      return failure(`unknown command "${name}"`);
  }
}
