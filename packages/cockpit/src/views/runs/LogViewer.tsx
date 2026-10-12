import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDownToLine, Braces, Search } from 'lucide-react';
import type { RunLogView } from '../../data/run-log-store.ts';
import { integer } from '../../format/format.ts';
import { Button } from '../../ui/components/Button.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import { LogEntryRow } from './LogEntryRow.tsx';
import type { LogFilter } from './run-log-model.ts';
import { countLogFilter, filterLogEntries, LOG_FILTER_LABELS, LOG_FILTERS } from './run-log-model.ts';

const ESTIMATED_ROW_HEIGHT = 34;
const OVERSCAN_ROWS = 12;
const FOLLOW_THRESHOLD_PX = 48;
const INITIAL_RECT = { width: 900, height: 640 };

interface LogViewerProps {
  readonly log: RunLogView;
  readonly live: boolean;
}

export function LogViewer({ log, live }: LogViewerProps) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const [query, setQuery] = useState('');
  const [follow, setFollow] = useState(live);
  const [showRaw, setShowRaw] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const entries = useMemo(() => filterLogEntries(log.entries, filter, query), [log, filter, query]);
  const counts = useMemo(() => Object.fromEntries(LOG_FILTERS.map((entry) => [entry, countLogFilter(log.entries, entry)])), [log]);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
    initialRect: INITIAL_RECT,
    getItemKey: (index) => entries[index]?.index ?? index,
  });

  useEffect(() => {
    if (follow && entries.length > 0) virtualizer.scrollToIndex(entries.length - 1, { align: 'end' });
  }, [follow, entries.length, log.version, virtualizer]);

  const toggle = (index: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const onScroll = () => {
    const element = scrollRef.current;
    if (element === null) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distance > FOLLOW_THRESHOLD_PX && follow) setFollow(false);
  };

  return (
    <div className="log-viewer">
      <div className="log-viewer__toolbar">
        <Segmented
          size="sm"
          label="Filtrer le journal"
          value={filter}
          onChange={setFilter}
          items={LOG_FILTERS.map((entry) => ({ id: entry, label: LOG_FILTER_LABELS[entry], count: counts[entry] }))}
        />
        <label className="log-viewer__search">
          <Search size={13} aria-hidden="true" />
          <span className="visually-hidden">Rechercher dans le journal</span>
          <input type="search" placeholder="Rechercher…" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        </label>
        <Button size="sm" variant={showRaw ? 'secondary' : 'ghost'} icon={<Braces size={13} />} aria-pressed={showRaw} onClick={() => setShowRaw((value) => !value)}>
          Brut
        </Button>
        <span className="log-viewer__count num">{integer(log.lineCount)} lignes</span>
        {live ? (
          <Button
            size="sm"
            variant={follow ? 'secondary' : 'ghost'}
            icon={<ArrowDownToLine size={13} />}
            aria-pressed={follow}
            onClick={() => setFollow((value) => !value)}
          >
            {follow ? 'Suivi en direct' : 'Suivre'}
          </Button>
        ) : null}
      </div>
      {log.status === 'loading' && log.entries.length === 0 ? (
        <div className="log-viewer__loading">
          <Skeleton lines={6} />
        </div>
      ) : log.status === 'error' ? (
        <EmptyState compact title="Impossible de charger le journal" description={log.error ?? undefined} />
      ) : entries.length === 0 ? (
        <EmptyState compact title={log.entries.length === 0 ? 'Le journal est vide' : 'Aucune ligne ne correspond'} />
      ) : (
        <div ref={scrollRef} className="log-viewer__scroll" data-virtual-viewport="" onScroll={onScroll} tabIndex={0} role="log" aria-label="Journal du run" aria-live={live && follow ? 'polite' : 'off'}>
          <div className="log-viewer__canvas" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const entry = entries[item.index];
              if (entry === undefined) return null;
              return (
                <div key={item.key} ref={virtualizer.measureElement} data-index={item.index} className="log-viewer__item" style={{ transform: `translateY(${item.start}px)` }}>
                  <LogEntryRow entry={entry} expanded={expanded.has(entry.index)} onToggle={toggle} showRaw={showRaw} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
