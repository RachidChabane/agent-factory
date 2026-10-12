export interface CommandLine {
  readonly scenarioPath: string | null;
  readonly statePath: string | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly settings: string | null;
  readonly permissionMode: string | null;
  readonly toolList: string | null;
  readonly resumeSessionId: string | null;
  readonly promptArgument: string | null;
}

type ValueOption = Exclude<keyof CommandLine, 'promptArgument'>;
type OptionValues = Partial<Record<ValueOption, string>>;

const FLAG_PREFIX = '-';
const INLINE_VALUE_SEPARATOR = '=';
const PRINT_FLAGS: readonly string[] = ['-p', '--print'];

const VALUE_OPTIONS: ReadonlyMap<string, ValueOption> = new Map<string, ValueOption>([
  ['--scenario', 'scenarioPath'],
  ['--state', 'statePath'],
  ['--model', 'model'],
  ['--effort', 'effort'],
  ['--settings', 'settings'],
  ['--permission-mode', 'permissionMode'],
  ['--tools', 'toolList'],
  ['--resume', 'resumeSessionId'],
  ['-r', 'resumeSessionId'],
]);

interface Flag {
  readonly name: string;
  readonly inlineValue: string | null;
}

function flagOf(token: string): Flag | null {
  if (!token.startsWith(FLAG_PREFIX) || token === FLAG_PREFIX) {
    return null;
  }
  const separator = token.indexOf(INLINE_VALUE_SEPARATOR);
  return separator === -1
    ? { name: token, inlineValue: null }
    : { name: token.slice(0, separator), inlineValue: token.slice(separator + INLINE_VALUE_SEPARATOR.length) };
}

function presentOrNull(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

/**
 * Reads the flags the fake acts on and ignores every other one, with or without a value. The prompt
 * is the argument that follows `-p`/`--print`; without one it arrives on standard input.
 */
export function parseCommandLine(argv: readonly string[]): CommandLine {
  const values: OptionValues = {};
  let promptArgument: string | undefined;
  let cursor = 0;

  const takeSeparateValue = (): string | undefined => {
    const next = argv[cursor];
    if (next === undefined || flagOf(next) !== null) {
      return undefined;
    }
    cursor += 1;
    return next;
  };

  while (cursor < argv.length) {
    const flag = flagOf(argv[cursor] ?? '');
    cursor += 1;
    if (flag === null) {
      continue;
    }
    const option = VALUE_OPTIONS.get(flag.name);
    if (option !== undefined) {
      const value = flag.inlineValue ?? takeSeparateValue();
      if (value !== undefined) {
        values[option] = value;
      }
    } else if (PRINT_FLAGS.includes(flag.name) && flag.inlineValue === null) {
      promptArgument = takeSeparateValue() ?? promptArgument;
    }
  }

  return {
    scenarioPath: presentOrNull(values.scenarioPath),
    statePath: presentOrNull(values.statePath),
    model: presentOrNull(values.model),
    effort: presentOrNull(values.effort),
    settings: presentOrNull(values.settings),
    permissionMode: presentOrNull(values.permissionMode),
    toolList: values.toolList ?? null,
    resumeSessionId: presentOrNull(values.resumeSessionId),
    promptArgument: presentOrNull(promptArgument),
  };
}

const TOOL_SEPARATOR = ',';
const DEFAULT_TOOL_LIST = 'default';

export function toolsOf(toolList: string | null, defaults: readonly string[]): readonly string[] {
  if (toolList === null || toolList === DEFAULT_TOOL_LIST) {
    return defaults;
  }
  return toolList
    .split(TOOL_SEPARATOR)
    .map((tool) => tool.trim())
    .filter((tool) => tool !== '');
}
