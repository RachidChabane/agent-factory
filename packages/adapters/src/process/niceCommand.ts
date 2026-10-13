import { BACKGROUND_NICENESS, NICE_EXECUTABLE, NICE_LEVEL_FLAG } from './constants.ts';

/** The command, run at a lower priority than the operator's own work. */
export function niced(command: readonly string[]): readonly string[] {
  return [NICE_EXECUTABLE, NICE_LEVEL_FLAG, String(BACKGROUND_NICENESS), ...command];
}
