import type { RunView } from '@agent-factory/cockpit';
import {
  RUN_FINISHED_EVENT,
  RUN_STARTED_EVENT,
  RUN_SUBJECT_PREFIX,
  RunFinishedPayloadSchema,
  RunStartedPayloadSchema,
  PIPELINE_EVENTS,
  pendingDecisionRequest,
  type PipelineJournal,
  type RunFinishedPayload,
  type RunStartedPayload,
} from '@agent-factory/application';
import { ISSUE_ESCALATION_STATE, issueSubject } from '@agent-factory/domain';
import { lastOf, type EventIndex } from './event-index.ts';
import type { SnapshotContext } from './snapshot-context.ts';

export interface RecordedRun {
  readonly started: RunStartedPayload;
  readonly finished: RunFinishedPayload | null;
}

export function recordedRuns(index: EventIndex): readonly RecordedRun[] {
  return index.subjectsWithPrefix(RUN_SUBJECT_PREFIX).flatMap((subject) => {
    const records = index.subject(subject);
    const started = lastOf(records, RUN_STARTED_EVENT);
    if (started === null) return [];
    const finished = lastOf(records, RUN_FINISHED_EVENT);
    return [
      {
        started: RunStartedPayloadSchema.parse(started.payload),
        finished: finished === null ? null : RunFinishedPayloadSchema.parse(finished.payload),
      },
    ];
  });
}

export interface PendingQuestion {
  readonly id: string;
  readonly text: string;
  readonly askedAt: string;
}

export const DECISION_QUESTION_PREFIX = 'decision-';
const WAITING = 'waiting';
const ANSWERED = 'succeeded';

export function pendingQuestions(index: EventIndex, journals: ReadonlyMap<number, PipelineJournal>): ReadonlyMap<string, PendingQuestion> {
  const questions = new Map<string, PendingQuestion>();
  for (const journal of journals.values()) {
    if (journal.state !== ISSUE_ESCALATION_STATE) continue;
    const request = pendingDecisionRequest(journal);
    if (request === null) continue;
    const asked = index
      .subject(issueSubject(journal.issueNumber))
      .findLast((record) => record.type === PIPELINE_EVENTS.implementerAttemptFinished);
    questions.set(request.runId, {
      id: `${DECISION_QUESTION_PREFIX}${request.runId}`,
      text: request.decisionRequest ?? request.finalTextTail,
      askedAt: (asked?.occurredAt ?? new Date(0)).toISOString(),
    });
  }
  return questions;
}

function runView(run: RecordedRun, context: SnapshotContext, questions: ReadonlyMap<string, PendingQuestion>): RunView {
  const { started, finished } = run;
  const log = context.runLogs.get(started.id);
  const question = questions.get(started.id) ?? null;
  const status = finished === null ? started.status : finished.status === WAITING && question === null ? ANSWERED : finished.status;
  return {
    id: started.id,
    role: started.role,
    model: started.model,
    effort: started.effort,
    status,
    outcome: finished?.outcome ?? null,
    subject: started.subject,
    attempt: started.attempt,
    currentTool: finished === null ? (log?.currentTool ?? null) : null,
    branch: started.branch,
    startedAt: started.startedAt,
    endedAt: finished?.endedAt ?? null,
    usage: finished?.usage ?? log?.progress?.usage ?? started.usage,
    costUsd: finished?.costUsd ?? started.costUsd,
    turns: finished?.turns ?? log?.progress?.turns ?? started.turns,
    maxTurns: started.maxTurns,
    maxBudgetUsd: started.maxBudgetUsd,
    lastLine: log?.lastLine ?? null,
    logLength: log?.logLength ?? 0,
    subagents: started.subagents,
    pendingQuestion:
      finished === null ? started.pendingQuestion : question === null ? null : { id: question.id, text: question.text, options: [], askedAt: question.askedAt },
  };
}

export function projectRuns(runs: readonly RecordedRun[], context: SnapshotContext, questions: ReadonlyMap<string, PendingQuestion>): RunView[] {
  return runs
    .map((run) => runView(run, context, questions))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || left.id.localeCompare(right.id));
}
