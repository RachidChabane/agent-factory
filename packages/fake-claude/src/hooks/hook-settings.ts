import { errorMessage } from '../errors.ts';
import { ROOT_PATH, type JsonPath } from '../json/json-path.ts';
import {
  DocumentError,
  fieldsOf,
  mapList,
  readList,
  readNonEmptyString,
  readNumber,
  readOptional,
  readRecord,
  readString,
  type NumberBounds,
} from '../json/json-reader.ts';
import { HOOK_EVENTS } from '../stream/stream-vocabulary.ts';

export interface CommandHook {
  readonly command: string;
  readonly timeoutSeconds: number;
}

export interface HookGroup {
  readonly matcher: RegExp | null;
  readonly hooks: readonly CommandHook[];
}

export interface HookConfiguration {
  readonly preToolUse: readonly HookGroup[];
  readonly stop: readonly HookGroup[];
}

export const NO_HOOKS: HookConfiguration = { preToolUse: [], stop: [] };
export const DEFAULT_HOOK_TIMEOUT_SECONDS = 600;

const COMMAND_HOOK_TYPE = 'command';
const MATCH_EVERY_TOOL = '*';
const MIN_HOOK_TIMEOUT_SECONDS = 0.01;
const SECONDS_PER_DAY = 86_400;
const TIMEOUT_BOUNDS: NumberBounds = { min: MIN_HOOK_TIMEOUT_SECONDS, max: SECONDS_PER_DAY };

export function parseHookConfiguration(document: unknown): HookConfiguration {
  const root = readRecord(document, ROOT_PATH);
  return readOptional(fieldsOf(root, ROOT_PATH)('hooks'), readEvents) ?? NO_HOOKS;
}

export function hooksMatching(groups: readonly HookGroup[], toolName: string): readonly CommandHook[] {
  return groups.filter((group) => group.matcher === null || group.matcher.test(toolName)).flatMap((group) => group.hooks);
}

export function allHooks(groups: readonly HookGroup[]): readonly CommandHook[] {
  return groups.flatMap((group) => group.hooks);
}

function readEvents(value: unknown, path: JsonPath): HookConfiguration {
  const at = fieldsOf(readRecord(value, path), path);
  return {
    preToolUse: readOptional(at(HOOK_EVENTS.preToolUse), readGroups) ?? [],
    stop: readOptional(at(HOOK_EVENTS.stop), readGroups) ?? [],
  };
}

function readGroups(value: unknown, path: JsonPath): readonly HookGroup[] {
  return mapList(readList(value, path), path, readGroup);
}

function readGroup(value: unknown, path: JsonPath): HookGroup {
  const at = fieldsOf(readRecord(value, path), path);
  const hooks = mapList(readList(...at('hooks')), at('hooks')[1], readHook);
  return {
    matcher: readOptional(at('matcher'), readMatcher) ?? null,
    hooks: hooks.filter((hook) => hook !== null),
  };
}

function readMatcher(value: unknown, path: JsonPath): RegExp | null {
  const pattern = readString(value, path);
  if (pattern === '' || pattern === MATCH_EVERY_TOOL) {
    return null;
  }
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch (error) {
    throw new DocumentError(path, `is not a valid regular expression (${errorMessage(error)})`);
  }
}

function readHook(value: unknown, path: JsonPath): CommandHook | null {
  const at = fieldsOf(readRecord(value, path), path);
  if (readString(...at('type')) !== COMMAND_HOOK_TYPE) {
    return null;
  }
  return {
    command: readNonEmptyString(...at('command')),
    timeoutSeconds: readOptional(at('timeout'), (timeout, timeoutPath) => readNumber(timeout, timeoutPath, TIMEOUT_BOUNDS)) ?? DEFAULT_HOOK_TIMEOUT_SECONDS,
  };
}
