import { ExpectationFailed } from './expectations.ts';
import { endNote, type CliRun } from './factory-cli.ts';
import { formatSeconds, LINE_SEPARATOR, lastLines } from './format.ts';

const TRANSCRIPT_OUTPUT_LINES = 40;
const NO_OUTPUT = '(no output)';

/** What went wrong, as the reader of a failed run needs it: the expectation that failed, or the error with its stack. */
export function describeFailure(error: unknown): string {
  if (error instanceof ExpectationFailed) return error.message;
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

function describeTranscriptEntry(run: CliRun): string {
  const note = endNote(run);
  const output = run.output.trimEnd();
  return [`$ ${run.command}  (exit code ${run.exitCode}${note === null ? '' : `, ${note}`}, ${formatSeconds(run.durationMs)})`, output === '' ? NO_OUTPUT : lastLines(output, TRANSCRIPT_OUTPUT_LINES)].join(LINE_SEPARATOR);
}

/** What each factory command printed, in the order the commands ended. */
export function renderTranscript(runs: readonly CliRun[]): string {
  return runs.map(describeTranscriptEntry).join(`${LINE_SEPARATOR}${LINE_SEPARATOR}`);
}
