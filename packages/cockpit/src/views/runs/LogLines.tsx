import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { LogEntry } from '../../data/run-log-entries.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { LogEntryRow } from './LogEntryRow.tsx';

const ESTIMATED_ROW_HEIGHT = 34;
const OVERSCAN_ROWS = 12;
/** How far from the end the operator may scroll up before the log stops following. */
const FOLLOW_THRESHOLD_PX = 48;

interface LogLinesProps {
  readonly entries: readonly LogEntry[];
  /** Changes whenever the log gains a line, so that a log that is followed keeps its end in view. */
  readonly version: number;
  readonly live: boolean;
  readonly follow: boolean;
  readonly loading: boolean;
  readonly showRaw: boolean;
  readonly expanded: ReadonlySet<number>;
  readonly onToggle: (index: number) => void;
  readonly onLeaveEnd: () => void;
}

/** The entries of the log, drawn only where the viewport is, and announced to assistive technology only while they are followed. */
export function LogLines({ entries, version, live, follow, loading, showRaw, expanded, onToggle, onLeaveEnd }: LogLinesProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
    getItemKey: (position) => entries[position]?.index ?? position,
  });

  useEffect(() => {
    if (follow && entries.length > 0) virtualizer.scrollToIndex(entries.length - 1, { align: 'end' });
  }, [follow, entries.length, version, virtualizer]);

  // Only a move away from the end is the operator's: the adjustments the list makes while it measures rows never go up with the end out of reach.
  const onScroll = () => {
    const element = scrollRef.current;
    if (element === null) return;
    const movedUp = element.scrollTop < lastScrollTop.current;
    lastScrollTop.current = element.scrollTop;
    const distanceFromEnd = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (follow && movedUp && distanceFromEnd > FOLLOW_THRESHOLD_PX) onLeaveEnd();
  };

  return (
    <div
      ref={scrollRef}
      className="log-viewer__scroll"
      data-virtual-viewport=""
      tabIndex={0}
      role="log"
      aria-label={t('runs.log.label')}
      aria-live={live && follow ? 'polite' : 'off'}
      aria-busy={loading || undefined}
      onScroll={onScroll}
    >
      <div className="log-viewer__canvas" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const entry = entries[item.index];
          if (entry === undefined) return null;
          return (
            <div key={item.key} ref={virtualizer.measureElement} data-index={item.index} className="log-viewer__item" style={{ transform: `translateY(${item.start}px)` }}>
              <LogEntryRow entry={entry} expanded={expanded.has(entry.index)} onToggle={onToggle} showRaw={showRaw} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
