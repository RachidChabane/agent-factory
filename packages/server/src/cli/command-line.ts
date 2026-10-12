import { parseLabelList } from '@agent-factory/application';
import { FORGE_KINDS, type ForgeKind } from '../config/schema/project.ts';

export const PROGRAM_NAME = 'agent-factory';

export const COMMAND_NAMES = {
  init: 'init',
  validate: 'validate',
  schema: 'schema',
  start: 'start',
  status: 'status',
  usage: 'usage',
  stop: 'stop',
  runIssue: 'run-issue',
  resume: 'resume',
  merge: 'merge',
  rehearsal: 'rehearsal',
  request: 'request',
  issue: 'issue',
  pr: 'pr',
  audit: 'audit',
  help: 'help',
} as const;

export const REQUEST_SUBCOMMANDS = { add: 'add', challenge: 'challenge' } as const;
export const ISSUE_SUBCOMMANDS = { create: 'create', abandon: 'abandon' } as const;
export const PR_SUBCOMMANDS = { feedback: 'feedback' } as const;
export const REHEARSAL_SUBCOMMANDS = { init: 'init', reset: 'reset', addIssue: 'add-issue' } as const;

export const PROJECT_OPTION = '--project';
export const IMAGES_OPTION = '--images';
export const REQUESTER_OPTION = '--requester';
export const CONFIRM_FLAG = '--confirm';
export const AUTHOR_OPTION = '--author';
export const EXPECTED_HEAD_OPTION = '--expected-head';
export const LABELS_OPTION = '--labels';
export const ANSWER_OPTION = '--answer';
export const REASON_OPTION = '--reason';
export const SKIP_GATE_PREFLIGHT_FLAG = '--skip-gate-preflight';
export const OFFLINE_FLAG = '--offline';
export const REFRESH_FLAG = '--refresh';
export const DEMO_FLAG = '--demo';
export const NOW_FLAG = '--now';
export const FORCE_FLAG = '--force';
export const ID_OPTION = '--id';
export const FORGE_OPTION = '--forge';
export const NAME_OPTION = '--name';
export const PORT_OPTION = '--port';
const MAX_PORT = 65_535;
export const DEFAULT_REQUESTER = 'unknown';
const OPTION_VALUE_SEPARATOR = '=';
const HELP_FLAGS: readonly string[] = ['-h', '--help'];
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const COMMIT_REFERENCE = /^[0-9a-f]{7,40}$/;
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;

export const USAGE = [
  `Usage: ${PROGRAM_NAME} [${PROJECT_OPTION} <id>] <command>`,
  '',
  `Commands that act on one project take ${PROJECT_OPTION} <id>; it may be left out when the configuration has one project.`,
  '',
  'Set up',
  '  init [<repository>] [--id <id>] [--name <name>] [--forge github|local] [--force]',
  '                                               inspect a repository and add it as a project to the configuration',
  '  validate [--offline] [--skip-gate-preflight] check the configuration; without --offline also every tool, forge and gate command',
  '  schema                                       print the JSON Schema of the configuration file',
  '',
  'Run',
  '  start [--demo] [--port <port>]               run the factory and serve the cockpit; --demo plays fictional projects with no account',
  '  status [<issue>]                             the installation at a glance, or the state of one issue',
  '  usage [--refresh]                            subscription usage by account and limit; --refresh reads it now',
  '  stop [--now]                                 stop the running factory once its running work finishes; --now stops its agents too',
  '  run-issue <issue>                            drive a validated issue to an open pull request, resuming where it stopped',
  '  resume <issue> [--answer <text>]             after an escalation, return the issue to the stage it left; --answer carries the decision asked for',
  '  merge <pull-request> --expected-head <sha>   remove the evidence and squash-merge the reviewed head (full sha)',
  '',
  'Work items',
  '  request add <file> [--images <dir>] [--requester <name>]   store a product request with its images',
  '  request challenge <id>                       challenge a stored request and draft its specs, report and reply',
  '  issue create <spec.md> [--confirm]           create an issue from a spec file; on GitHub it needs --confirm',
  '  issue abandon <issue> --reason <text>        stop the factory work on an escalated issue and free its worktree',
  '  pr feedback <pull-request> <file> --author <name>   record review feedback and start a new cycle',
  '  audit <commit> [<commit>...]                 audit commits of the base branch, one at a time',
  '',
  'Rehearsal (projects on a local forge)',
  '  rehearsal init <source-clone>                mirror a source clone into the local forge and clone it for the project',
  '  rehearsal reset <source-clone>               reset the local forge and its clone to the source clone',
  '  rehearsal add-issue <spec.md> [--labels a,b] create a local issue from a spec file',
].join('\n');

export type CliCommand =
  | { readonly kind: 'init'; readonly repository: string | null; readonly id: string | null; readonly name: string | null; readonly forge: ForgeKind | null; readonly force: boolean }
  | { readonly kind: 'validate'; readonly offline: boolean; readonly gatePreflight: boolean }
  | { readonly kind: 'schema' }
  | { readonly kind: 'start'; readonly demo: boolean; readonly port: number | null }
  | { readonly kind: 'status'; readonly issueNumber: number | null }
  | { readonly kind: 'usage'; readonly refresh: boolean }
  | { readonly kind: 'stop'; readonly now: boolean }
  | { readonly kind: 'run-issue'; readonly issueNumber: number }
  | { readonly kind: 'resume'; readonly issueNumber: number; readonly answer: string | null }
  | { readonly kind: 'merge'; readonly pullRequestNumber: number; readonly expectedHeadSha: string }
  | { readonly kind: 'rehearsal-init'; readonly sourceClonePath: string }
  | { readonly kind: 'rehearsal-reset'; readonly sourceClonePath: string }
  | { readonly kind: 'rehearsal-add-issue'; readonly specPath: string; readonly labels: readonly string[] }
  | { readonly kind: 'request-add'; readonly path: string; readonly imagesDirectory: string | null; readonly requester: string }
  | { readonly kind: 'request-challenge'; readonly requestId: string }
  | { readonly kind: 'issue-create'; readonly specPath: string; readonly confirmed: boolean }
  | { readonly kind: 'issue-abandon'; readonly issueNumber: number; readonly reason: string }
  | { readonly kind: 'pr-feedback'; readonly pullRequestNumber: number; readonly path: string; readonly author: string }
  | { readonly kind: 'audit'; readonly commits: readonly string[] }
  | { readonly kind: 'help' };

/** A command, with the project it names when the operator named one. */
export interface CommandLine {
  readonly project: string | null;
  readonly command: CliCommand;
}

export type ParsedCommandLine = { readonly ok: true; readonly line: CommandLine } | { readonly ok: false; readonly error: string };
type ParsedCommand = { readonly ok: true; readonly command: CliCommand } | { readonly ok: false; readonly error: string };

function failure(error: string): { readonly ok: false; readonly error: string } {
  return { ok: false, error };
}

function done(command: CliCommand): ParsedCommand {
  return { ok: true, command };
}

function positiveInteger(value: string | undefined, what: string): number | string {
  if (value === undefined) return `missing ${what}`;
  return POSITIVE_INTEGER.test(value) ? Number(value) : `${what} must be a positive integer, got "${value}"`;
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

function withOptions(rest: readonly string[], valueOptions: readonly string[], flagOptions: readonly string[], build: (options: ParsedOptions) => ParsedCommand): ParsedCommand {
  const parsed = parseOptions(rest, valueOptions, flagOptions);
  return parsed.ok ? build(parsed.options) : failure(parsed.error);
}

function single(rest: readonly string[], what: string, build: (value: number) => CliCommand): ParsedCommand {
  return withOptions(rest, [], [], ({ positional }) => {
    const problem = exactly(positional, [what]);
    if (problem !== null) return failure(problem);
    const value = positiveInteger(positional[0], what);
    return typeof value === 'string' ? failure(value) : done(build(value));
  });
}

function isForgeKind(value: string): value is ForgeKind {
  return FORGE_KINDS.some((forge) => forge === value);
}

function parseInit(rest: readonly string[]): ParsedCommand {
  return withOptions(rest, [ID_OPTION, NAME_OPTION, FORGE_OPTION], [FORCE_FLAG], ({ positional, values, flags }) => {
    if (positional.length > 1) return failure(`unexpected arguments: ${positional.slice(1).join(' ')}`);
    const forge = values.get(FORGE_OPTION) ?? null;
    if (forge !== null && !isForgeKind(forge)) return failure(`${FORGE_OPTION} must be one of ${FORGE_KINDS.join(', ')}, got "${forge}"`);
    return done({ kind: 'init', repository: positional[0] ?? null, id: values.get(ID_OPTION) ?? null, name: values.get(NAME_OPTION) ?? null, forge, force: flags.has(FORCE_FLAG) });
  });
}

function parseStart(rest: readonly string[]): ParsedCommand {
  return withOptions(rest, [PORT_OPTION], [DEMO_FLAG], ({ positional, values, flags }) => {
    if (positional.length > 0) return failure(`unexpected arguments: ${positional.join(' ')}`);
    const requested = values.get(PORT_OPTION);
    if (requested === undefined) return done({ kind: 'start', demo: flags.has(DEMO_FLAG), port: null });
    const port = positiveInteger(requested, 'port');
    if (typeof port === 'string' || port > MAX_PORT) return failure(`${PORT_OPTION} must be a port number from 1 to ${MAX_PORT}, got "${requested}"`);
    return done({ kind: 'start', demo: flags.has(DEMO_FLAG), port });
  });
}

function parseStatus(rest: readonly string[]): ParsedCommand {
  return withOptions(rest, [], [], ({ positional }) => {
    if (positional.length > 1) return failure(`unexpected arguments: ${positional.slice(1).join(' ')}`);
    if (positional[0] === undefined) return done({ kind: 'status', issueNumber: null });
    const value = positiveInteger(positional[0], 'issue number');
    return typeof value === 'string' ? failure(value) : done({ kind: 'status', issueNumber: value });
  });
}

function parseRequest(rest: readonly string[]): ParsedCommand {
  const [subcommand, ...arguments_] = rest;
  switch (subcommand) {
    case REQUEST_SUBCOMMANDS.add:
      return withOptions(arguments_, [IMAGES_OPTION, REQUESTER_OPTION], [], ({ positional, values }) => {
        const problem = exactly(positional, ['request file']);
        if (problem !== null) return failure(problem);
        return done({ kind: 'request-add', path: positional[0] ?? '', imagesDirectory: values.get(IMAGES_OPTION) ?? null, requester: values.get(REQUESTER_OPTION) ?? DEFAULT_REQUESTER });
      });
    case REQUEST_SUBCOMMANDS.challenge:
      return withOptions(arguments_, [], [], ({ positional }) => {
        const problem = exactly(positional, ['request id']);
        return problem === null ? done({ kind: 'request-challenge', requestId: positional[0] ?? '' }) : failure(problem);
      });
    default:
      return failure(subcommand === undefined ? 'missing request subcommand' : `unknown request subcommand "${subcommand}"`);
  }
}

function parseIssue(rest: readonly string[]): ParsedCommand {
  const [subcommand, ...arguments_] = rest;
  switch (subcommand) {
    case ISSUE_SUBCOMMANDS.create:
      return withOptions(arguments_, [], [CONFIRM_FLAG], ({ positional, flags }) => {
        const problem = exactly(positional, ['spec file']);
        return problem === null ? done({ kind: 'issue-create', specPath: positional[0] ?? '', confirmed: flags.has(CONFIRM_FLAG) }) : failure(problem);
      });
    case ISSUE_SUBCOMMANDS.abandon:
      return withOptions(arguments_, [REASON_OPTION], [], ({ positional, values }) => {
        const problem = exactly(positional, ['issue number']);
        if (problem !== null) return failure(problem);
        const issueNumber = positiveInteger(positional[0], 'issue number');
        if (typeof issueNumber === 'string') return failure(issueNumber);
        const reason = values.get(REASON_OPTION)?.trim() ?? '';
        return reason === '' ? failure(`missing ${REASON_OPTION} <text>`) : done({ kind: 'issue-abandon', issueNumber, reason });
      });
    default:
      return failure(subcommand === undefined ? 'missing issue subcommand' : `unknown issue subcommand "${subcommand}"`);
  }
}

function parsePullRequest(rest: readonly string[]): ParsedCommand {
  const [subcommand, ...arguments_] = rest;
  if (subcommand !== PR_SUBCOMMANDS.feedback) return failure(subcommand === undefined ? 'missing pr subcommand' : `unknown pr subcommand "${subcommand}"`);
  return withOptions(arguments_, [AUTHOR_OPTION], [], ({ positional, values }) => {
    const problem = exactly(positional, ['pull request number', 'feedback file']);
    if (problem !== null) return failure(problem);
    const pullRequestNumber = positiveInteger(positional[0], 'pull request number');
    if (typeof pullRequestNumber === 'string') return failure(pullRequestNumber);
    const author = values.get(AUTHOR_OPTION);
    return author === undefined ? failure(`missing ${AUTHOR_OPTION} <name>`) : done({ kind: 'pr-feedback', pullRequestNumber, path: positional[1] ?? '', author });
  });
}

function parseRehearsal(rest: readonly string[]): ParsedCommand {
  const [subcommand, ...arguments_] = rest;
  switch (subcommand) {
    case REHEARSAL_SUBCOMMANDS.init:
    case REHEARSAL_SUBCOMMANDS.reset:
      return withOptions(arguments_, [], [], ({ positional }) => {
        const problem = exactly(positional, ['source clone path']);
        if (problem !== null) return failure(problem);
        const sourceClonePath = positional[0] ?? '';
        return done(subcommand === REHEARSAL_SUBCOMMANDS.init ? { kind: 'rehearsal-init', sourceClonePath } : { kind: 'rehearsal-reset', sourceClonePath });
      });
    case REHEARSAL_SUBCOMMANDS.addIssue:
      return withOptions(arguments_, [LABELS_OPTION], [], ({ positional, values }) => {
        const problem = exactly(positional, ['spec file']);
        return problem === null ? done({ kind: 'rehearsal-add-issue', specPath: positional[0] ?? '', labels: parseLabelList(values.get(LABELS_OPTION) ?? '') }) : failure(problem);
      });
    default:
      return failure(subcommand === undefined ? 'missing rehearsal subcommand' : `unknown rehearsal subcommand "${subcommand}"`);
  }
}

function parseResume(rest: readonly string[]): ParsedCommand {
  return withOptions(rest, [ANSWER_OPTION], [], ({ positional, values }) => {
    const problem = exactly(positional, ['issue number']);
    if (problem !== null) return failure(problem);
    const issueNumber = positiveInteger(positional[0], 'issue number');
    if (typeof issueNumber === 'string') return failure(issueNumber);
    const answer = values.get(ANSWER_OPTION);
    if (answer !== undefined && answer.trim() === '') return failure(`${ANSWER_OPTION} needs the text of the answer`);
    return done({ kind: 'resume', issueNumber, answer: answer ?? null });
  });
}

function parseMerge(rest: readonly string[]): ParsedCommand {
  return withOptions(rest, [EXPECTED_HEAD_OPTION], [], ({ positional, values }) => {
    const problem = exactly(positional, ['pull request number']);
    if (problem !== null) return failure(problem);
    const pullRequestNumber = positiveInteger(positional[0], 'pull request number');
    if (typeof pullRequestNumber === 'string') return failure(pullRequestNumber);
    const expectedHeadSha = values.get(EXPECTED_HEAD_OPTION);
    if (expectedHeadSha === undefined) return failure(`missing ${EXPECTED_HEAD_OPTION} <sha>`);
    if (!FULL_COMMIT_SHA.test(expectedHeadSha)) return failure(`${EXPECTED_HEAD_OPTION} must be the full 40-character commit sha, got "${expectedHeadSha}"`);
    return done({ kind: 'merge', pullRequestNumber, expectedHeadSha });
  });
}

function parseAudit(rest: readonly string[]): ParsedCommand {
  return withOptions(rest, [], [], ({ positional }) => {
    if (positional.length === 0) return failure('missing commit');
    const invalid = positional.find((commit) => !COMMIT_REFERENCE.test(commit));
    return invalid === undefined ? done({ kind: 'audit', commits: positional }) : failure(`commit must be a hexadecimal sha of 7 to 40 characters, got "${invalid}"`);
  });
}

function parseCommand(name: string, rest: readonly string[]): ParsedCommand {
  switch (name) {
    case COMMAND_NAMES.init:
      return parseInit(rest);
    case COMMAND_NAMES.validate:
      return withOptions(rest, [], [OFFLINE_FLAG, SKIP_GATE_PREFLIGHT_FLAG], ({ positional, flags }) =>
        positional.length > 0 ? failure(`unexpected arguments: ${positional.join(' ')}`) : done({ kind: 'validate', offline: flags.has(OFFLINE_FLAG), gatePreflight: !flags.has(SKIP_GATE_PREFLIGHT_FLAG) }),
      );
    case COMMAND_NAMES.schema:
      return rest.length === 0 ? done({ kind: 'schema' }) : failure(`unexpected arguments: ${rest.join(' ')}`);
    case COMMAND_NAMES.start:
      return parseStart(rest);
    case COMMAND_NAMES.status:
      return parseStatus(rest);
    case COMMAND_NAMES.stop:
      return withOptions(rest, [], [NOW_FLAG], ({ positional, flags }) => (positional.length > 0 ? failure(`unexpected arguments: ${positional.join(' ')}`) : done({ kind: 'stop', now: flags.has(NOW_FLAG) })));
    case COMMAND_NAMES.usage:
      return withOptions(rest, [], [REFRESH_FLAG], ({ positional, flags }) => (positional.length > 0 ? failure(`unexpected arguments: ${positional.join(' ')}`) : done({ kind: 'usage', refresh: flags.has(REFRESH_FLAG) })));
    case COMMAND_NAMES.runIssue:
      return single(rest, 'issue number', (issueNumber) => ({ kind: 'run-issue', issueNumber }));
    case COMMAND_NAMES.resume:
      return parseResume(rest);
    case COMMAND_NAMES.merge:
      return parseMerge(rest);
    case COMMAND_NAMES.rehearsal:
      return parseRehearsal(rest);
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

/** Takes `--project <id>` from anywhere on the line, then parses the command. */
export function parseCommandLine(argv: readonly string[]): ParsedCommandLine {
  const rest: string[] = [];
  let project: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    if (argument === PROJECT_OPTION || argument.startsWith(`${PROJECT_OPTION}${OPTION_VALUE_SEPARATOR}`)) {
      const value = argument === PROJECT_OPTION ? argv[index + 1] : argument.slice(PROJECT_OPTION.length + OPTION_VALUE_SEPARATOR.length);
      if (value === undefined || value === '') return failure(`missing value for ${PROJECT_OPTION}`);
      project = value;
      if (argument === PROJECT_OPTION) index += 1;
    } else {
      rest.push(argument);
    }
  }
  const [name, ...arguments_] = rest;
  if (name === undefined || name === COMMAND_NAMES.help || HELP_FLAGS.includes(name)) return { ok: true, line: { project, command: { kind: 'help' } } };
  const parsed = parseCommand(name, arguments_);
  return parsed.ok ? { ok: true, line: { project, command: parsed.command } } : parsed;
}
