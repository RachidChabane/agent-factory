import type { ReactNode } from 'react';
import { Bell, ChevronRight, CircleAlert, CircleCheck, Gauge, ListTodo, Play, ShieldAlert, Webhook } from 'lucide-react';
import type { LogEntry } from '../../data/run-log-entries.ts';
import { clockTime, duration, percent, toEpoch } from '../../format/format.ts';
import { WINDOW_SHORT_LABELS } from '../../i18n/labels.ts';
import { formatToolInput } from '../../model/tool-call.ts';
import { rawLineOf } from './run-log-model.ts';
import { AgentGlyph } from '../../ui/components/AgentGlyph.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';

const CODE_FENCE = /```[a-z]*\n?([\s\S]*?)```/g;
const FENCE_BODY_GROUP = 1;
const SUCCESS_EXIT_CODE = 0;
const FAILED_TASK_STATUS = 'failed';
const TASK_STATUS_LABELS: Readonly<Record<string, string>> = {
  completed: 'terminée',
  failed: 'en échec',
  stopped: 'arrêtée',
  killed: 'arrêtée',
};

interface TextSegment {
  readonly kind: 'prose' | 'code';
  readonly text: string;
}

export function splitCodeFences(text: string): readonly TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(CODE_FENCE)) {
    const start = match.index;
    if (start > cursor) segments.push({ kind: 'prose', text: text.slice(cursor, start) });
    segments.push({ kind: 'code', text: (match[FENCE_BODY_GROUP] ?? '').trimEnd() });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) segments.push({ kind: 'prose', text: text.slice(cursor) });
  return segments.filter((segment) => segment.text.trim().length > 0);
}

function AssistantText({ text }: { readonly text: string }) {
  return (
    <div className="log-text">
      {splitCodeFences(text).map((segment, index) =>
        segment.kind === 'code' ? (
          <pre key={index} className="log-text__code">
            {segment.text}
          </pre>
        ) : (
          <p key={index} className="log-text__prose">
            {segment.text.trim()}
          </p>
        ),
      )}
    </div>
  );
}

function Frame({ entry, icon, children, tone = 'default' }: { readonly entry: LogEntry; readonly icon: ReactNode; readonly children: ReactNode; readonly tone?: 'default' | 'failed' | 'success' | 'muted' | undefined }) {
  const nested = 'parentToolUseId' in entry && entry.parentToolUseId !== null;
  return (
    <div className={`log-row log-row--${entry.kind} log-row--${tone}${nested ? ' is-nested' : ''}`}>
      <time className="log-row__time num" dateTime={entry.at}>
        {clockTime(entry.at)}
      </time>
      <span className="log-row__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="log-row__body">{children}</div>
    </div>
  );
}

interface ToolRowProps {
  readonly entry: Extract<LogEntry, { kind: 'tool' }>;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

function toolMark(entry: Extract<LogEntry, { kind: 'tool' }>) {
  if (entry.result === null) return <StatusMark mark="running" size={13} label="En cours" />;
  return entry.result.isError ? <StatusMark mark="failed" size={13} label="Erreur" /> : <StatusMark mark="success" size={13} label="Terminé" />;
}

function ToolRow({ entry, expanded, onToggle }: ToolRowProps) {
  const elapsed = entry.result === null ? null : duration(toEpoch(entry.result.at) - toEpoch(entry.at));
  return (
    <Frame entry={entry} icon={toolMark(entry)} tone={entry.result?.isError === true ? 'failed' : 'default'}>
      <button type="button" className="log-tool__summary" aria-expanded={expanded} onClick={onToggle}>
        <ChevronRight size={13} className="log-tool__chevron" aria-hidden="true" />
        <span className="log-tool__name">{entry.toolName}</span>
        <span className="log-tool__input mono truncate">{entry.summary.slice(entry.toolName.length + 3) || '—'}</span>
        {elapsed === null ? null : <span className="log-tool__duration num">{elapsed}</span>}
      </button>
      {expanded ? (
        <div className="log-tool__details">
          <p className="log-tool__label small-caps">Entrée</p>
          <pre className="log-tool__block">{formatToolInput(entry.input)}</pre>
          <p className="log-tool__label small-caps">{entry.result === null ? 'Résultat en attente' : entry.result.isError ? 'Erreur' : 'Résultat'}</p>
          {entry.result === null ? null : <pre className={`log-tool__block${entry.result.isError ? ' is-error' : ''}`}>{entry.result.content}</pre>}
        </div>
      ) : null}
    </Frame>
  );
}

interface LogEntryRowProps {
  readonly entry: LogEntry;
  readonly expanded: boolean;
  readonly onToggle: (index: number) => void;
  readonly showRaw?: boolean | undefined;
}

export function LogEntryRow({ entry, expanded, onToggle, showRaw = false }: LogEntryRowProps) {
  const line = showRaw && entry.kind !== 'raw' ? rawLineOf(entry) : null;
  return (
    <>
      <TypedEntryRow entry={entry} expanded={expanded} onToggle={onToggle} />
      {line === null ? null : (
        <Frame entry={entry} icon={<span className="log-raw__dot" />} tone="muted">
          <p className="log-raw log-raw--source mono">{line}</p>
        </Frame>
      )}
    </>
  );
}

function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status] ?? status;
}

function TypedEntryRow({ entry, expanded, onToggle }: Omit<LogEntryRowProps, 'showRaw'>) {
  switch (entry.kind) {
    case 'session':
      return (
        <Frame entry={entry} icon={<Play size={12} />} tone="muted">
          <p className="log-meta">
            Session démarrée · <span className="mono">{entry.model}</span>
          </p>
        </Frame>
      );
    case 'text':
      return (
        <Frame entry={entry} icon={<AgentGlyph size={13} />}>
          <AssistantText text={entry.text} />
        </Frame>
      );
    case 'tool':
      return <ToolRow entry={entry} expanded={expanded} onToggle={() => onToggle(entry.index)} />;
    case 'denied':
      return (
        <Frame entry={entry} icon={<ShieldAlert size={13} />} tone="failed">
          <p className="log-meta">
            Permission refusée pour <span className="mono">{entry.toolName}</span> — {entry.message}
          </p>
        </Frame>
      );
    case 'hook': {
      const failed = entry.exitCode !== null && entry.exitCode !== SUCCESS_EXIT_CODE;
      return (
        <Frame entry={entry} icon={<Webhook size={13} />} tone={failed ? 'failed' : 'success'}>
          <p className="log-hook">
            <span className="log-hook__name">Hook {entry.hookName ?? entry.hookEvent}</span>
            {entry.exitCode === null ? null : <span className="log-hook__code num">code {entry.exitCode}</span>}
            <span className="log-hook__decision">{failed ? 'arrêt refusé' : 'autorisé'}</span>
          </p>
          {entry.output.trim().length === 0 ? null : <p className="log-hook__output">{entry.output}</p>}
        </Frame>
      );
    }
    case 'hook-started':
      return (
        <Frame entry={entry} icon={<Webhook size={13} />} tone="muted">
          <p className="log-meta">
            Hook <span className="mono">{entry.hookName}</span> démarré
          </p>
        </Frame>
      );
    case 'task':
      return (
        <Frame entry={entry} icon={<ListTodo size={13} />} tone={entry.status === FAILED_TASK_STATUS ? 'failed' : entry.phase === 'finished' ? 'success' : 'muted'}>
          <p className="log-hook">
            <span className="log-hook__name">{entry.phase === 'started' ? 'Tâche démarrée' : `Tâche ${entry.status === null ? 'terminée' : taskStatusLabel(entry.status)}`}</span>
            <span className="log-hook__output">{entry.description}</span>
          </p>
        </Frame>
      );
    case 'notice':
      return (
        <Frame entry={entry} icon={<Bell size={13} />} tone="muted">
          <p className="log-meta">{entry.text}</p>
        </Frame>
      );
    case 'noise':
      return (
        <Frame entry={entry} icon={<span className="log-raw__dot" />} tone="muted">
          <p className="log-meta">{entry.label}</p>
        </Frame>
      );
    case 'gate': {
      const passedCount = entry.steps.filter((step) => step.outcome === 'passed').length;
      const failedSteps = entry.steps.filter((step) => step.outcome === 'failed');
      return (
        <Frame entry={entry} icon={entry.passed ? <CircleCheck size={13} /> : <CircleAlert size={13} />} tone={entry.passed ? 'success' : 'failed'}>
          <p className="log-gate__title">
            Gate {entry.passed ? 'réussi' : 'en échec'} · <span className="num">{passedCount}/{entry.steps.length}</span> étapes
          </p>
          <ul className="log-gate__steps">
            {entry.steps.map((step) => (
              <li key={step.name} className={`log-gate__step log-gate__step--${step.outcome}`}>
                <StatusMark mark={step.outcome === 'passed' ? 'success' : step.outcome === 'failed' ? 'failed' : 'idle'} size={12} />
                {step.name}
              </li>
            ))}
          </ul>
          {failedSteps.map((step) => (
            <p key={step.name} className="log-gate__detail mono">
              {step.name} : {step.detail}
            </p>
          ))}
        </Frame>
      );
    }
    case 'rate-limit':
      return (
        <Frame entry={entry} icon={<Gauge size={13} />} tone="muted">
          <p className="log-meta">
            Abonnement :{' '}
            {entry.snapshots.map((snapshot) => `${WINDOW_SHORT_LABELS[snapshot.window]} ${percent(snapshot.utilization)}`).join(' · ')}
          </p>
        </Frame>
      );
    case 'raw':
      return (
        <Frame entry={entry} icon={<span className="log-raw__dot" />} tone="muted">
          <p className="log-raw mono">{entry.line}</p>
        </Frame>
      );
  }
}
