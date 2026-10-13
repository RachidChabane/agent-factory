import { parseLabelList, type Delegation } from '@agent-factory/application';
import { FILM_SCENARIO_RULE, isFilmScenarioName } from '@agent-factory/domain';
import { FORGE_KINDS, type ForgeKind } from '../config/schema/project.ts';
import { DEFAULT_WATCH_INTERVAL_SECONDS } from '../watch/watch-settings.ts';

export const PROGRAM_NAME = 'agent-factory';

export const COMMAND_NAMES = {
  init: 'init',
  validate: 'validate',
  schema: 'schema',
  start: 'start',
  status: 'status',
  usage: 'usage',
  watch: 'watch',
  stop: 'stop',
  runIssue: 'run-issue',
  resume: 'resume',
  merge: 'merge',
  rehearsal: 'rehearsal',
  request: 'request',
  issue: 'issue',
  pr: 'pr',
  audit: 'audit',
  film: 'film',
  tool: 'tool',
  help: 'help',
} as const;

export const REQUEST_SUBCOMMANDS = { add: 'add', challenge: 'challenge' } as const;
export const ISSUE_SUBCOMMANDS = { create: 'create', validate: 'validate', abandon: 'abandon' } as const;
export const PR_SUBCOMMANDS = { feedback: 'feedback' } as const;
export const REHEARSAL_SUBCOMMANDS = { init: 'init', reset: 'reset', addIssue: 'add-issue' } as const;
export const TOOL_SUBCOMMANDS = { check: 'check', login: 'login' } as const;

/** Every verb of the command line. */
export const COMMAND_VERBS: readonly string[] = Object.values(COMMAND_NAMES);

/** The subcommands of the verbs that have some. */
export const COMMAND_SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = {
  [COMMAND_NAMES.request]: Object.values(REQUEST_SUBCOMMANDS),
  [COMMAND_NAMES.issue]: Object.values(ISSUE_SUBCOMMANDS),
  [COMMAND_NAMES.pr]: Object.values(PR_SUBCOMMANDS),
  [COMMAND_NAMES.rehearsal]: Object.values(REHEARSAL_SUBCOMMANDS),
  [COMMAND_NAMES.tool]: Object.values(TOOL_SUBCOMMANDS),
};

export const PROJECT_OPTION = '--project';
export const IMAGES_OPTION = '--images';
export const REQUESTER_OPTION = '--requester';
export const CONFIRM_FLAG = '--confirm';
export const START_FLAG = '--start';
export const BLOCKED_BY_OPTION = '--blocked-by';
export const AUTHOR_OPTION = '--author';
export const EXPECTED_HEAD_OPTION = '--expected-head';
export const LABELS_OPTION = '--labels';
export const ANSWER_OPTION = '--answer';
export const REVIEW_AGAIN_FLAG = '--review-again';
export const REASON_OPTION = '--reason';
export const AS_OPTION = '--as';
export const SCENARIO_OPTION = '--scenario';
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
export const INTERVAL_OPTION = '--interval';
export const ONCE_FLAG = '--once';
export const JSON_FLAG = '--json';
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
  '  watch [--interval <seconds>] [--once] [--json] [--port <port>]',
  '                                               poll the running factory (every 20 s by default) and print one line for each blocker that appears or clears;',
  '                                               --once prints the blockers present now and exits 1 when there are any; --json prints one JSON object per line',
  '  tool check <name>                            check a connected tool now, as validate does',
  '  tool login <name>                            start the login the tool declares (no terminal needed), then check it',
  '  stop [--now]                                 stop the running factory once its running work finishes; --now stops its agents too',
  '  run-issue <issue>                            drive a validated issue to an open pull request, resuming where it stopped',
  '  resume <issue> [--answer <text>]             after an escalation, return the issue to the stage it left; --answer carries the decision asked for',
  '  resume <issue> --review-again                after a review escalation whose gate passed, review the same implementation again, without an implementer attempt',
  '  merge <pull-request> --expected-head <sha>   remove the evidence and squash-merge the reviewed head (full sha)',
  '',
  'Acting for the operator',
  '  The gestures a project can delegate (issue create --start, issue validate, resume, merge) take',
  '    --as <actor> --reason "<why>"',
  '  both together: the factory checks the project\'s autonomy policy first, refuses what it does not delegate and names what is',
  '  missing (exit 1), and records each accepted gesture with its reason. Without --as the gesture is the operator\'s own.',
  '',
  'Work items',
  '  request add <file> [--images <dir>] [--requester <name>]   store a product request with its images',
  '  request challenge <id>                       challenge a stored request and draft its specs, report and reply',
  '  issue create <spec.md> [--blocked-by <n>[,<n>]] [--confirm] [--start]',
  '                                               create an issue from a spec file (on GitHub it needs --confirm; a Films: header names the scenarios to film);',
  '                                               --blocked-by lists the issues it waits on; --start validates it at once',
  '  issue validate <issue>                       validate the spec of a drafted issue, so the factory takes it',
  '  issue abandon <issue> --reason <text>        stop the factory work on an escalated issue and free its worktree',
  '  pr feedback <pull-request> <file> --author <name>   record review feedback and start a new cycle',
  '  audit <commit> [<commit>...]                 audit commits of the base branch, one at a time',
  '  film <issue> --scenario <name>               order the film of a scenario on the open pull request of the issue: it records the base and the head,',
  '                                               commits both on the branch and adds them to the pull request body (needs evidence.films)',
  '',
  'Rehearsal (projects on a local forge)',
  '  rehearsal init <source-clone>                mirror a source clone into the local forge and clone it for the project',
  '  rehearsal reset <source-clone>               reset the local forge and its clone to the source clone',
  '  rehearsal add-issue <spec.md> [--labels a,b] create a local issue from a spec file (Title:, Labels:, optional Films:, then the four sections)',
].join('\n');

export type CliCommand =
  | { readonly kind: 'init'; readonly repository: string | null; readonly id: string | null; readonly name: string | null; readonly forge: ForgeKind | null; readonly force: boolean }
  | { readonly kind: 'validate'; readonly offline: boolean; readonly gatePreflight: boolean }
  | { readonly kind: 'schema' }
  | { readonly kind: 'start'; readonly demo: boolean; readonly port: number | null }
  | { readonly kind: 'status'; readonly issueNumber: number | null }
  | { readonly kind: 'usage'; readonly refresh: boolean }
  | { readonly kind: 'watch'; readonly intervalSeconds: number; readonly once: boolean; readonly json: boolean; readonly port: number | null }
  | { readonly kind: 'stop'; readonly now: boolean }
  | { readonly kind: 'run-issue'; readonly issueNumber: number }
  | { readonly kind: 'resume'; readonly issueNumber: number; readonly answer: string | null; readonly reviewAgain: boolean; readonly delegation: Delegation | null }
  | { readonly kind: 'merge'; readonly pullRequestNumber: number; readonly expectedHeadSha: string; readonly delegation: Delegation | null }
  | { readonly kind: 'rehearsal-init'; readonly sourceClonePath: string }
  | { readonly kind: 'rehearsal-reset'; readonly sourceClonePath: string }
  | { readonly kind: 'rehearsal-add-issue'; readonly specPath: string; readonly labels: readonly string[] }
  | { readonly kind: 'request-add'; readonly path: string; readonly imagesDirectory: string | null; readonly requester: string }
  | { readonly kind: 'request-challenge'; readonly requestId: string }
  | {
      readonly kind: 'issue-create';
      readonly specPath: string;
      readonly blockedBy: readonly number[];
      readonly confirmed: boolean;
      readonly start: boolean;
      readonly delegation: Delegation | null;
    }
  | { readonly kind: 'issue-validate'; readonly issueNumber: number; readonly delegation: Delegation | null }
  | { readonly kind: 'issue-abandon'; readonly issueNumber: number; readonly reason: string }
  | { readonly kind: 'pr-feedback'; readonly pullRequestNumber: number; readonly path: string; readonly author: string }
  | { readonly kind: 'audit'; readonly commits: readonly string[] }
  | { readonly kind: 'film'; readonly issueNumber: number; readonly scenario: string }
  | { readonly kind: 'tool-check'; readonly tool: string }
  | { readonly kind: 'tool-login'; readonly tool: string }
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

/** The options a gesture that a project can delegate takes besides its own. */
const DELEGATION_OPTIONS: readonly string[] = [AS_OPTION, REASON_OPTION];

/** `--as <actor> --reason <text>`, given both or neither: null when the operator makes the gesture themselves, or what is wrong with the pair. */
function delegationOf(values: ReadonlyMap<string, string>): Delegation | null | string {
  const actor = values.get(AS_OPTION);
  const reason = values.get(REASON_OPTION)?.trim();
  if (actor === undefined && reason === undefined) return null;
  if (actor === undefined) return `${REASON_OPTION} goes with ${AS_OPTION} <actor>`;
  if (reason === undefined || reason === '') return `${AS_OPTION} needs ${REASON_OPTION} "<why>"`;
  return { actor, reason };
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

/** The port a command line names, null when it names none, or the reason it is refused. */
function portOf(values: ReadonlyMap<string, string>): number | null | string {
  const requested = values.get(PORT_OPTION);
  if (requested === undefined) return null;
  const port = positiveInteger(requested, 'port');
  return typeof port === 'string' || port > MAX_PORT ? `${PORT_OPTION} must be a port number from 1 to ${MAX_PORT}, got "${requested}"` : port;
}

function parseStart(rest: readonly string[]): ParsedCommand {
  return withOptions(rest, [PORT_OPTION], [DEMO_FLAG], ({ positional, values, flags }) => {
    if (positional.length > 0) return failure(`unexpected arguments: ${positional.join(' ')}`);
    const port = portOf(values);
    return typeof port === 'string' ? failure(port) : done({ kind: 'start', demo: flags.has(DEMO_FLAG), port });
  });
}

function parseWatch(rest: readonly string[]): ParsedCommand {
  return withOptions(rest, [INTERVAL_OPTION, PORT_OPTION], [ONCE_FLAG, JSON_FLAG], ({ positional, values, flags }) => {
    if (positional.length > 0) return failure(`unexpected arguments: ${positional.join(' ')}`);
    const requested = values.get(INTERVAL_OPTION);
    const interval = requested === undefined ? DEFAULT_WATCH_INTERVAL_SECONDS : positiveInteger(requested, 'interval');
    if (typeof interval === 'string') return failure(`${INTERVAL_OPTION} must be a whole number of seconds, 1 or more, got "${requested}"`);
    const port = portOf(values);
    return typeof port === 'string' ? failure(port) : done({ kind: 'watch', intervalSeconds: interval, once: flags.has(ONCE_FLAG), json: flags.has(JSON_FLAG), port });
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

/** The issue numbers of a comma-separated list, each once, or the reason the list is refused. */
function issueNumbersOf(list: string | undefined): readonly number[] | string {
  if (list === undefined) return [];
  const numbers = list.split(',').map((item) => item.trim());
  return numbers.every((item) => POSITIVE_INTEGER.test(item)) ? [...new Set(numbers.map(Number))] : `${BLOCKED_BY_OPTION} must list issue numbers separated by commas, got "${list}"`;
}

function parseIssue(rest: readonly string[]): ParsedCommand {
  const [subcommand, ...arguments_] = rest;
  switch (subcommand) {
    case ISSUE_SUBCOMMANDS.create:
      return withOptions(arguments_, [BLOCKED_BY_OPTION, ...DELEGATION_OPTIONS], [CONFIRM_FLAG, START_FLAG], ({ positional, values, flags }) => {
        const problem = exactly(positional, ['spec file']);
        if (problem !== null) return failure(problem);
        const blockedBy = issueNumbersOf(values.get(BLOCKED_BY_OPTION));
        if (typeof blockedBy === 'string') return failure(blockedBy);
        const delegation = delegationOf(values);
        if (typeof delegation === 'string') return failure(delegation);
        if (delegation !== null && !flags.has(START_FLAG)) return failure(`${AS_OPTION} goes with ${START_FLAG}: creating an issue is no gesture of the operator, validating its spec is`);
        return done({ kind: 'issue-create', specPath: positional[0] ?? '', blockedBy, confirmed: flags.has(CONFIRM_FLAG), start: flags.has(START_FLAG), delegation });
      });
    case ISSUE_SUBCOMMANDS.validate:
      return withOptions(arguments_, DELEGATION_OPTIONS, [], ({ positional, values }) => {
        const problem = exactly(positional, ['issue number']);
        if (problem !== null) return failure(problem);
        const issueNumber = positiveInteger(positional[0], 'issue number');
        if (typeof issueNumber === 'string') return failure(issueNumber);
        const delegation = delegationOf(values);
        return typeof delegation === 'string' ? failure(delegation) : done({ kind: 'issue-validate', issueNumber, delegation });
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
  return withOptions(rest, [ANSWER_OPTION, ...DELEGATION_OPTIONS], [REVIEW_AGAIN_FLAG], ({ positional, values, flags }) => {
    const problem = exactly(positional, ['issue number']);
    if (problem !== null) return failure(problem);
    const issueNumber = positiveInteger(positional[0], 'issue number');
    if (typeof issueNumber === 'string') return failure(issueNumber);
    const answer = values.get(ANSWER_OPTION);
    if (answer !== undefined && answer.trim() === '') return failure(`${ANSWER_OPTION} needs the text of the answer`);
    const reviewAgain = flags.has(REVIEW_AGAIN_FLAG);
    if (reviewAgain && answer !== undefined) return failure(`${REVIEW_AGAIN_FLAG} cannot be combined with ${ANSWER_OPTION}`);
    const delegation = delegationOf(values);
    return typeof delegation === 'string' ? failure(delegation) : done({ kind: 'resume', issueNumber, answer: answer ?? null, reviewAgain, delegation });
  });
}

function parseMerge(rest: readonly string[]): ParsedCommand {
  return withOptions(rest, [EXPECTED_HEAD_OPTION, ...DELEGATION_OPTIONS], [], ({ positional, values }) => {
    const problem = exactly(positional, ['pull request number']);
    if (problem !== null) return failure(problem);
    const pullRequestNumber = positiveInteger(positional[0], 'pull request number');
    if (typeof pullRequestNumber === 'string') return failure(pullRequestNumber);
    const expectedHeadSha = values.get(EXPECTED_HEAD_OPTION);
    if (expectedHeadSha === undefined) return failure(`missing ${EXPECTED_HEAD_OPTION} <sha>`);
    if (!FULL_COMMIT_SHA.test(expectedHeadSha)) return failure(`${EXPECTED_HEAD_OPTION} must be the full 40-character commit sha, got "${expectedHeadSha}"`);
    const delegation = delegationOf(values);
    return typeof delegation === 'string' ? failure(delegation) : done({ kind: 'merge', pullRequestNumber, expectedHeadSha, delegation });
  });
}

function parseAudit(rest: readonly string[]): ParsedCommand {
  return withOptions(rest, [], [], ({ positional }) => {
    if (positional.length === 0) return failure('missing commit');
    const invalid = positional.find((commit) => !COMMIT_REFERENCE.test(commit));
    return invalid === undefined ? done({ kind: 'audit', commits: positional }) : failure(`commit must be a hexadecimal sha of 7 to 40 characters, got "${invalid}"`);
  });
}

function parseFilm(rest: readonly string[]): ParsedCommand {
  return withOptions(rest, [SCENARIO_OPTION], [], ({ positional, values }) => {
    const problem = exactly(positional, ['issue number']);
    if (problem !== null) return failure(problem);
    const issueNumber = positiveInteger(positional[0], 'issue number');
    if (typeof issueNumber === 'string') return failure(issueNumber);
    const scenario = values.get(SCENARIO_OPTION);
    if (scenario === undefined) return failure(`missing ${SCENARIO_OPTION} <name>`);
    if (!isFilmScenarioName(scenario)) return failure(`${SCENARIO_OPTION} must be ${FILM_SCENARIO_RULE}, got "${scenario}"`);
    return done({ kind: 'film', issueNumber, scenario });
  });
}

function parseTool(rest: readonly string[]): ParsedCommand {
  const [subcommand, ...arguments_] = rest;
  if (subcommand !== TOOL_SUBCOMMANDS.check && subcommand !== TOOL_SUBCOMMANDS.login) {
    return failure(subcommand === undefined ? 'missing tool subcommand' : `unknown tool subcommand "${subcommand}"`);
  }
  return withOptions(arguments_, [], [], ({ positional }) => {
    const problem = exactly(positional, ['tool name']);
    if (problem !== null) return failure(problem);
    const tool = positional[0] ?? '';
    return done(subcommand === TOOL_SUBCOMMANDS.check ? { kind: 'tool-check', tool } : { kind: 'tool-login', tool });
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
    case COMMAND_NAMES.watch:
      return parseWatch(rest);
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
    case COMMAND_NAMES.film:
      return parseFilm(rest);
    case COMMAND_NAMES.tool:
      return parseTool(rest);
    default:
      return failure(`unknown command "${name}"`);
  }
}

/** The commands whose gesture a project can delegate; `--as` on any other is refused with the list. */
const DELEGABLE_COMMANDS: readonly string[] = [COMMAND_NAMES.resume, COMMAND_NAMES.merge, `${COMMAND_NAMES.issue} ${ISSUE_SUBCOMMANDS.create}`, `${COMMAND_NAMES.issue} ${ISSUE_SUBCOMMANDS.validate}`];

function mentions(arguments_: readonly string[], option: string): boolean {
  return arguments_.some((argument) => argument === option || argument.startsWith(`${option}${OPTION_VALUE_SEPARATOR}`));
}

/** Why `--as` is refused on this command, or null when the command can take it. */
function delegationRefusal(name: string, arguments_: readonly string[]): string | null {
  if (!mentions(arguments_, AS_OPTION)) return null;
  const subcommand = name === COMMAND_NAMES.issue ? arguments_[0] : undefined;
  const command = subcommand === undefined ? name : `${name} ${subcommand}`;
  return DELEGABLE_COMMANDS.includes(command) ? null : `${command} is not a gesture a project can delegate; ${AS_OPTION} goes with ${DELEGABLE_COMMANDS.join(', ')}`;
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
  const refusal = delegationRefusal(name, arguments_);
  if (refusal !== null) return failure(refusal);
  const parsed = parseCommand(name, arguments_);
  return parsed.ok ? { ok: true, line: { project, command: parsed.command } } : parsed;
}
