import { resolve } from 'node:path';
import { parseJsonText, readJsonFile, validateDocument } from '../json/json-file.ts';
import { NO_HOOKS, parseHookConfiguration, type HookConfiguration } from './hook-settings.ts';

const SETTINGS_LABEL = 'settings';
const INLINE_JSON_START = '{';
const INLINE_SOURCE = 'given inline';

/** Reads the `--settings` argument, which is a JSON file or, like the real CLI accepts, inline JSON. */
export async function loadHookConfiguration(settingsArgument: string | null, workingDirectory: string): Promise<HookConfiguration> {
  if (settingsArgument === null) {
    return NO_HOOKS;
  }
  const inline = settingsArgument.trimStart().startsWith(INLINE_JSON_START);
  const source = inline ? INLINE_SOURCE : resolve(workingDirectory, settingsArgument);
  const document = inline ? parseJsonText(settingsArgument, source, SETTINGS_LABEL) : await readJsonFile(source, SETTINGS_LABEL);
  return validateDocument(SETTINGS_LABEL, source, () => parseHookConfiguration(document));
}
