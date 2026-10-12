import type { ReactNode } from 'react';
import type { LogEntry } from '../../data/run-log-entries.ts';
import { Time } from '../../widgets/Time.tsx';

export type LogRowTone = 'default' | 'failed' | 'success' | 'muted';

interface LogRowFrameProps {
  readonly entry: LogEntry;
  readonly icon: ReactNode;
  readonly tone?: LogRowTone | undefined;
  readonly children: ReactNode;
}

/** The time, the icon and the body every row of the log shares; a row written by a subagent is set in from the others. */
export function LogRowFrame({ entry, icon, tone = 'default', children }: LogRowFrameProps) {
  const nested = 'parentToolUseId' in entry && entry.parentToolUseId !== null;
  return (
    <div className={`log-row log-row--${entry.kind} log-row--${tone}${nested ? ' is-nested' : ''}`}>
      <Time iso={entry.at} mode="time" className="log-row__time num" />
      <span className="log-row__icon">{icon}</span>
      <div className="log-row__body">{children}</div>
    </div>
  );
}
