import './log-viewer.css';
import './log-entries.css';
import { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import type { RunLogView } from '../../data/run-log-store.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { LogLines } from './LogLines.tsx';
import { LogToolbar } from './LogToolbar.tsx';
import type { LogFilter, LogPhase } from './run-log-model.ts';
import { countLogFilters, filterLogEntries, logPhase } from './run-log-model.ts';

const STATE_ICON_SIZE = 16;
const SKELETON_LINES = 6;

function LogState({ phase, error }: { readonly phase: Exclude<LogPhase, 'ready'>; readonly error: string | null }) {
  const { t } = useI18n();
  if (phase === 'loading') {
    return (
      <div className="log-viewer__loading" role="status" aria-busy="true">
        <span className="visually-hidden">{t('runs.log.loading')}</span>
        <Skeleton lines={SKELETON_LINES} />
      </div>
    );
  }
  const icon = <ScrollText size={STATE_ICON_SIZE} />;
  if (phase === 'error') return <EmptyState compact icon={icon} title={t('runs.log.error')} description={error ?? undefined} />;
  if (phase === 'waiting') return <EmptyState compact icon={icon} title={t('runs.log.waiting')} description={t('runs.log.waitingDescription')} />;
  return <EmptyState compact icon={icon} title={t('runs.log.noLog')} description={t('runs.log.noLogDescription')} />;
}

interface LogViewerProps {
  readonly log: RunLogView;
  /** Whether the agent can still write to the log. */
  readonly live: boolean;
  /** How many lines the factory says the run logged, which tells a log still loading from a run that has none. */
  readonly recordedLines: number;
}

/** The log of a run: filters, a search, a raw view of the system lines, and the lines themselves, followed live while the agent writes. */
export function LogViewer({ log, live, recordedLines }: LogViewerProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<LogFilter>('all');
  const [query, setQuery] = useState('');
  const [follow, setFollow] = useState(live);
  const [showRaw, setShowRaw] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const phase = logPhase(log, { live, recordedLines });
  const entries = useMemo(() => filterLogEntries(log.entries, filter, query), [log, filter, query]);
  const counts = useMemo(() => countLogFilters(log.entries), [log]);

  const toggleEntry = (index: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  if (phase !== 'ready') {
    return (
      <div className="log-viewer">
        <LogState phase={phase} error={log.error} />
      </div>
    );
  }
  return (
    <div className="log-viewer">
      <LogToolbar
        filter={filter}
        onFilter={setFilter}
        counts={counts}
        query={query}
        onQuery={setQuery}
        showRaw={showRaw}
        onToggleRaw={() => setShowRaw((value) => !value)}
        lineCount={log.lineCount}
        live={live}
        follow={follow}
        onToggleFollow={() => setFollow((value) => !value)}
      />
      {log.status === 'error' ? (
        <p className="log-viewer__notice" role="alert">
          {t('runs.log.partialError', { error: log.error ?? '' })}
        </p>
      ) : null}
      {entries.length === 0 ? (
        <EmptyState compact title={t('runs.log.noMatch')} description={t('runs.log.noMatchDescription')} />
      ) : (
        <LogLines
          entries={entries}
          version={log.version}
          live={live}
          follow={follow}
          loading={log.status === 'loading'}
          showRaw={showRaw}
          expanded={expanded}
          onToggle={toggleEntry}
          onLeaveEnd={() => setFollow(false)}
        />
      )}
    </div>
  );
}
