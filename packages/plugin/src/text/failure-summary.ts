import { lastLines } from './bounded-tail.ts';

export const FAILURE_OUTPUT_TAIL_LINES = 60;

const ANSI_ESCAPE_SEQUENCE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
const CARRIAGE_RETURN_LINE_ENDING = /\r\n?/g;
const NEWLINE = '\n';

export function stripTerminalControls(text: string): string {
  return text.replace(ANSI_ESCAPE_SEQUENCE, '').replace(CARRIAGE_RETURN_LINE_ENDING, NEWLINE);
}

export function summariseFailureOutput(output: string, maxLines: number = FAILURE_OUTPUT_TAIL_LINES): string {
  return lastLines(stripTerminalControls(output).trimEnd(), maxLines);
}
