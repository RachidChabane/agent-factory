import { uuidFrom } from '../ids/deterministic-ids.ts';
import { NO_USAGE } from '../metering/metering.ts';
import type { ScopedUsageWindow, UsageSettings, UsageWindow } from '../scenario/scenario.ts';
import { initLine, textBlock, type InitDetails } from '../stream/conversation-lines.ts';
import { usageFields, type Stamp, type StreamLine } from '../stream/stream-line.ts';
import {
  ASSISTANT_ROLE,
  LINE_TYPES,
  MESSAGE_TYPE,
  RESULT_SUBTYPE_SUCCESS,
  STOP_REASON_END_TURN,
} from '../stream/stream-vocabulary.ts';
import { resetInstant } from './rate-limits.ts';
import { usageSummaryOf } from './usage-summary.ts';

export const USAGE_PROMPT = '/usage';

const USAGE_SESSION_ID = uuidFrom('usage-report/session');
const SYNTHETIC_MODEL = '<synthetic>';
const LOCAL_COMMAND = 'usage';
const SESSION_DURATION_MS = 2_334;
const REPORT_DURATION_MS = 1_191;
const SEVERITY_NORMAL = 'normal';
const UTC_OFFSET_SUFFIX = '+00:00';
const ZULU_SUFFIX = /Z$/;

const LIMIT_KINDS = { session: 'session', weeklyAll: 'weekly_all', weeklyScoped: 'weekly_scoped' } as const;
const LIMIT_GROUPS = { session: 'session', weekly: 'weekly' } as const;

const EXTRA_USAGE = {
  is_enabled: false,
  monthly_limit: null,
  used_credits: null,
  utilization: null,
  currency: null,
} as const;

export interface UsageReportRequest {
  readonly usage: UsageSettings;
  readonly now: Date;
  readonly workingDirectory: string;
  readonly tools: readonly string[];
  readonly model: string;
  readonly permissionMode: string;
}

export function isUsageRequest(prompt: string): boolean {
  return prompt.trim() === USAGE_PROMPT;
}

export function usageReportLines(request: UsageReportRequest): readonly StreamLine[] {
  const text = usageSummaryOf(request.usage, request.now);
  const init: InitDetails = {
    workingDirectory: request.workingDirectory,
    tools: request.tools,
    model: request.model,
    permissionMode: request.permissionMode,
  };
  return [
    initLine(stampOf('init'), init),
    reportLine(stampOf('report'), text, usageReportOf(request.usage, request.now)),
    resultOf(stampOf('result'), text),
  ];
}

export function isoWithOffset(instant: Date): string {
  return instant.toISOString().replace(ZULU_SUFFIX, UTC_OFFSET_SUFFIX);
}

function stampOf(kind: string): Stamp {
  return { sessionId: USAGE_SESSION_ID, uuid: uuidFrom(`usage-report/${kind}`) };
}

function reportLine(stamp: Stamp, text: string, usageReport: object): StreamLine {
  return {
    type: LINE_TYPES.assistant,
    message: {
      diagnostics: null,
      id: uuidFrom('usage-report/message'),
      container: null,
      model: SYNTHETIC_MODEL,
      role: ASSISTANT_ROLE,
      stop_details: null,
      stop_reason: STOP_REASON_END_TURN,
      stop_sequence: null,
      type: MESSAGE_TYPE,
      usage: usageFields(NO_USAGE),
      content: [textBlock(text)],
      context_management: null,
    },
    parent_tool_use_id: null,
    session_id: stamp.sessionId,
    uuid: stamp.uuid,
    usage_report: usageReport,
    local_command_run: { command: LOCAL_COMMAND, args: '' },
  };
}

function resultOf(stamp: Stamp, text: string): StreamLine {
  return {
    type: LINE_TYPES.result,
    subtype: RESULT_SUBTYPE_SUCCESS,
    is_error: false,
    duration_ms: REPORT_DURATION_MS,
    duration_api_ms: 0,
    num_turns: 0,
    stop_reason: null,
    session_id: stamp.sessionId,
    total_cost_usd: 0,
    usage: usageFields(NO_USAGE),
    permission_denials: [],
    local_command: LOCAL_COMMAND,
    result: text,
    uuid: stamp.uuid,
  };
}

function usageReportOf(usage: UsageSettings, now: Date): object {
  return {
    session: {
      total_cost_usd: 0,
      total_api_duration_ms: 0,
      total_duration_ms: SESSION_DURATION_MS,
      total_lines_added: 0,
      total_lines_removed: 0,
      model_usage: {},
    },
    rate_limits: {
      limits: [
        limitOf(LIMIT_KINDS.session, LIMIT_GROUPS.session, usage.session, now, null, true),
        limitOf(LIMIT_KINDS.weeklyAll, LIMIT_GROUPS.weekly, usage.weeklyAll, now, null, false),
        ...usage.weeklyScoped.map((scoped) =>
          limitOf(LIMIT_KINDS.weeklyScoped, LIMIT_GROUPS.weekly, scoped, now, scopeOf(scoped), false),
        ),
      ],
      extra_usage: EXTRA_USAGE,
    },
  };
}

function scopeOf(scoped: ScopedUsageWindow): object {
  return { model: { display_name: scoped.model }, surface: null };
}

function limitOf(kind: string, group: string, window: UsageWindow, now: Date, scope: object | null, active: boolean): object {
  return {
    kind,
    group,
    percent: window.percent,
    resets_at: isoWithOffset(resetInstant(now, window)),
    scope,
    severity: SEVERITY_NORMAL,
    is_active: active,
  };
}
