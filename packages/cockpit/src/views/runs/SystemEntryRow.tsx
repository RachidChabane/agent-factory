import { Bell, Gauge, ListTodo, Play, ShieldAlert, Webhook } from 'lucide-react';
import type { LogEntry } from '../../data/run-log-entries.ts';
import type { MessageKey } from '../../i18n/catalog/index.ts';
import type { Translate } from '../../i18n/create-i18n.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { LogRowTone } from './LogRowFrame.tsx';
import { LogRowFrame } from './LogRowFrame.tsx';
import type { GateEntry, HookEntry, TaskEntry, TextEntry, ToolEntry } from './run-log-model.ts';
import { canonicalTaskStatus, hookFailed } from './run-log-model.ts';

const ICON_SIZE = 13;
const SESSION_ICON_SIZE = 12;
const FAILED_TASK_STATUS = 'failed';
const WINDOW_SEPARATOR = ' · ';

/** The rows that are one line of text, as opposed to the agent's words, its tool calls and the gate. */
export type SystemEntry = Exclude<LogEntry, TextEntry | ToolEntry | GateEntry>;

function Dot() {
  return <span className="log-raw__dot" aria-hidden="true" />;
}

function hookTone(entry: HookEntry): LogRowTone {
  if (entry.exitCode === null) return 'muted';
  return hookFailed(entry) ? 'failed' : 'success';
}

function HookRow({ entry }: { readonly entry: HookEntry }) {
  const { t } = useI18n();
  const code = entry.exitCode;
  return (
    <LogRowFrame entry={entry} icon={<Webhook size={ICON_SIZE} />} tone={hookTone(entry)}>
      <p className="log-hook">
        <span className="log-hook__name">{t('runs.log.hook', { name: entry.hookName ?? entry.hookEvent })}</span>
        {code === null ? null : <span className="log-hook__code num">{t('runs.log.hook.exit', { code })}</span>}
        {code === null ? null : <span className="log-hook__decision">{hookFailed(entry) ? t('runs.log.hook.failed') : t('runs.log.hook.succeeded')}</span>}
      </p>
      {entry.output.trim().length === 0 ? null : <p className="log-hook__output">{entry.output}</p>}
    </LogRowFrame>
  );
}

function taskHeading(entry: TaskEntry, t: Translate, has: (key: string) => boolean): string {
  if (entry.phase === 'started') return t('runs.log.task.started');
  if (entry.status === null) return t('runs.log.task.finished');
  const key = `runs.log.task.status.${canonicalTaskStatus(entry.status)}`;
  return has(key) ? t(key as MessageKey) : t('runs.log.task.unknownStatus', { status: entry.status });
}

function taskTone(entry: TaskEntry): LogRowTone {
  if (entry.status === FAILED_TASK_STATUS) return 'failed';
  return entry.phase === 'finished' ? 'success' : 'muted';
}

function TaskRow({ entry }: { readonly entry: TaskEntry }) {
  const { t, has } = useI18n();
  return (
    <LogRowFrame entry={entry} icon={<ListTodo size={ICON_SIZE} />} tone={taskTone(entry)}>
      <p className="log-hook">
        <span className="log-hook__name">{taskHeading(entry, t, has)}</span>
        <span className="log-hook__output">{entry.description}</span>
      </p>
    </LogRowFrame>
  );
}

function RateLimitRow({ entry }: { readonly entry: Extract<SystemEntry, { kind: 'rate-limit' }> }) {
  const { t, fmt } = useI18n();
  const windows = entry.snapshots.map((snapshot) => t('runs.log.windowUtilization', { window: t(`runs.log.window.${snapshot.window}`), percent: fmt.percent(snapshot.utilization) })).join(WINDOW_SEPARATOR);
  return (
    <LogRowFrame entry={entry} icon={<Gauge size={ICON_SIZE} />} tone="muted">
      <p className="log-meta">{t('runs.log.rateLimit', { windows })}</p>
    </LogRowFrame>
  );
}

/** One line of the log that is not the agent's own words: a session, a hook, a task, a notice, a refusal, a limit or a raw line. */
export function SystemEntryRow({ entry }: { readonly entry: SystemEntry }) {
  const { t, rich } = useI18n();
  switch (entry.kind) {
    case 'session':
      return (
        <LogRowFrame entry={entry} icon={<Play size={SESSION_ICON_SIZE} />} tone="muted">
          <p className="log-meta">{rich('runs.log.session', { model: <span className="mono">{entry.model}</span> })}</p>
        </LogRowFrame>
      );
    case 'denied':
      return (
        <LogRowFrame entry={entry} icon={<ShieldAlert size={ICON_SIZE} />} tone="failed">
          <p className="log-meta">{rich('runs.log.denied', { tool: <span className="mono">{entry.toolName}</span>, message: entry.message })}</p>
        </LogRowFrame>
      );
    case 'hook':
      return <HookRow entry={entry} />;
    case 'hook-started':
      return (
        <LogRowFrame entry={entry} icon={<Webhook size={ICON_SIZE} />} tone="muted">
          <p className="log-meta">{rich('runs.log.hookStarted', { name: <span className="mono">{entry.hookName}</span> })}</p>
        </LogRowFrame>
      );
    case 'task':
      return <TaskRow entry={entry} />;
    case 'notice':
      return (
        <LogRowFrame entry={entry} icon={<Bell size={ICON_SIZE} />} tone="muted">
          <p className="log-meta">{entry.text}</p>
        </LogRowFrame>
      );
    case 'noise':
      return (
        <LogRowFrame entry={entry} icon={<Dot />} tone="muted">
          <p className="log-meta">{entry.subtype === null ? t('runs.log.noise.stream') : t('runs.log.noise.system', { subtype: entry.subtype })}</p>
        </LogRowFrame>
      );
    case 'rate-limit':
      return <RateLimitRow entry={entry} />;
    case 'raw':
      return (
        <LogRowFrame entry={entry} icon={<Dot />} tone="muted">
          <p className="log-raw mono">{entry.line}</p>
        </LogRowFrame>
      );
  }
}
