import type { LogEntry } from '../../data/run-log-entries.ts';
import { AgentGlyph } from '../../ui/components/AgentGlyph.tsx';
import { AssistantText } from './AssistantText.tsx';
import { GateEntryRow } from './GateEntryRow.tsx';
import { LogRowFrame } from './LogRowFrame.tsx';
import { rawLineOf } from './run-log-model.ts';
import { SystemEntryRow } from './SystemEntryRow.tsx';
import { ToolEntryRow } from './ToolEntryRow.tsx';

const TEXT_ICON_SIZE = 13;

interface LogEntryRowProps {
  readonly entry: LogEntry;
  readonly expanded: boolean;
  readonly onToggle: (index: number) => void;
  /** Whether to show the line a system row was parsed from under it. */
  readonly showRaw: boolean;
}

function TypedEntryRow({ entry, expanded, onToggle }: Omit<LogEntryRowProps, 'showRaw'>) {
  switch (entry.kind) {
    case 'text':
      return (
        <LogRowFrame entry={entry} icon={<AgentGlyph size={TEXT_ICON_SIZE} />}>
          <AssistantText text={entry.text} />
        </LogRowFrame>
      );
    case 'tool':
      return <ToolEntryRow entry={entry} expanded={expanded} onToggle={() => onToggle(entry.index)} />;
    case 'gate':
      return <GateEntryRow entry={entry} />;
    default:
      return <SystemEntryRow entry={entry} />;
  }
}

/** One entry of the log, followed by its source line when the operator asks for the raw view. */
export function LogEntryRow({ entry, expanded, onToggle, showRaw }: LogEntryRowProps) {
  const sourceLine = showRaw && entry.kind !== 'raw' ? rawLineOf(entry) : null;
  return (
    <>
      <TypedEntryRow entry={entry} expanded={expanded} onToggle={onToggle} />
      {sourceLine === null ? null : (
        <LogRowFrame entry={entry} icon={<span className="log-raw__dot" aria-hidden="true" />} tone="muted">
          <p className="log-raw log-raw--source mono">{sourceLine}</p>
        </LogRowFrame>
      )}
    </>
  );
}
