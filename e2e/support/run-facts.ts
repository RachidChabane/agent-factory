import {
  RunLogPageSchema,
  runLogPath,
  type CockpitSnapshot,
  type PendingQuestion,
  type RunLogEvent,
  type RunLogPage,
  type RunView,
} from '../../packages/cockpit/src/contract/index.ts';
import type { RunningFactory } from './factory.ts';

const JSON_CONTENT_TYPE = 'application/json';
const ISSUE_SUBJECT = 'issue';
const SUCCEEDED = 'succeeded';
const WAITING = 'waiting';

/** A run that stopped to ask the operator a question. */
export type WaitingRun = RunView & { readonly pendingQuestion: PendingQuestion };

type ToolCall = Extract<RunLogEvent, { kind: 'tool-call' }>;
type ToolResult = Extract<RunLogEvent, { kind: 'tool-result' }>;

function required<Value>(value: Value | undefined, what: string): Value {
  if (value === undefined) throw new Error(`the snapshot has no ${what}`);
  return value;
}

function isWaiting(run: RunView): run is WaitingRun {
  return run.status === WAITING && run.pendingQuestion !== null;
}

/** The run that stopped to ask the operator a question. */
export function waitingRunOf(state: CockpitSnapshot): WaitingRun {
  return required(state.runs.find(isWaiting), 'run waiting for an answer');
}

/** The run that stopped to ask the operator a question about one issue. */
export function waitingRunOnIssue(state: CockpitSnapshot, project: string, issueNumber: number): WaitingRun {
  const run = state.runs.find((candidate): candidate is WaitingRun => isWaiting(candidate) && candidate.project === project && candidate.subject.kind === ISSUE_SUBJECT && candidate.subject.id === String(issueNumber));
  return required(run, `run waiting for an answer about issue #${issueNumber} of ${project}`);
}

/** The first run of the role on the issue, in the order the runs started, that ended well. */
export function endedRunOf(state: CockpitSnapshot, project: string, role: RunView['role'], issueNumber: number): RunView {
  const runs = state.runs
    .filter((run) => run.project === project && run.role === role && run.status === SUCCEEDED && run.subject.kind === ISSUE_SUBJECT && run.subject.id === String(issueNumber))
    .toSorted((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
  return required(runs[0], `ended ${role} run of issue #${issueNumber} of ${project}`);
}

/** The log of a run as the factory serves it to the cockpit. */
export async function readRunLog(factory: RunningFactory, runId: string): Promise<RunLogPage> {
  const path = runLogPath(runId, null);
  const response = await fetch(`${factory.origin}${path}`, { headers: { accept: JSON_CONTENT_TYPE } });
  if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
  return RunLogPageSchema.parse(await response.json());
}

export function toolCallsOf(log: RunLogPage): readonly ToolCall[] {
  return log.lines.flatMap((line) => (line.event.kind === 'tool-call' ? [line.event] : []));
}

export function toolResultOf(log: RunLogPage, call: ToolCall): ToolResult | undefined {
  return log.lines.flatMap((line) => (line.event.kind === 'tool-result' && line.event.toolUseId === call.toolUseId ? [line.event] : [])).at(0);
}

export function textsOf(log: RunLogPage): readonly string[] {
  return log.lines.flatMap((line) => (line.event.kind === 'assistant-text' ? [line.event.text] : []));
}

export function hooksOf(log: RunLogPage): readonly Extract<RunLogEvent, { kind: 'hook' }>[] {
  return log.lines.flatMap((line) => (line.event.kind === 'hook' ? [line.event] : []));
}

export function gatesOf(log: RunLogPage): readonly Extract<RunLogEvent, { kind: 'gate' }>[] {
  return log.lines.flatMap((line) => (line.event.kind === 'gate' ? [line.event] : []));
}
