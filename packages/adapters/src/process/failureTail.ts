import { FAILURE_LINE_SEPARATOR, FAILURE_TAIL_CHARACTERS, FAILURE_TAIL_LINES } from './constants.ts';

const ANSI_ESCAPE = /\u001b\[[0-9;]*m/g;

/** The last lines a failed command printed, on one line and without colour codes. */
export function failureTail(output: string): string {
  const lines = output
    .replace(ANSI_ESCAPE, '')
    .split('\n')
    .filter((line) => line.trim() !== '');
  return lines.slice(-FAILURE_TAIL_LINES).join(FAILURE_LINE_SEPARATOR).slice(-FAILURE_TAIL_CHARACTERS);
}

/** What a failed command said: its error output, or its output when it printed nothing there. */
export function failureOf(result: { readonly stdout: string; readonly stderr: string }): string {
  return failureTail(result.stderr.trim() === '' ? result.stdout : result.stderr);
}
