import { ChevronRight } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { toEpoch } from '../../i18n/formatters.ts';
import { firstLine, formatToolInput, toolInputHints, truncate } from '../../model/tool-call.ts';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { LogRowFrame } from './LogRowFrame.tsx';
import type { ToolEntry } from './run-log-model.ts';
import { toolFailed } from './run-log-model.ts';

const MARK_SIZE = 13;
const INPUT_PREVIEW_MAX_LENGTH = 200;

function ToolMark({ entry }: { readonly entry: ToolEntry }) {
  const { t } = useI18n();
  if (entry.result === null) return <StatusMark mark="running" size={MARK_SIZE} label={t('runs.log.tool.running')} />;
  return toolFailed(entry) ? <StatusMark mark="failed" size={MARK_SIZE} label={t('runs.log.tool.error')} /> : <StatusMark mark="success" size={MARK_SIZE} label={t('runs.log.tool.done')} />;
}

function ToolDetails({ entry }: { readonly entry: ToolEntry }) {
  const { t } = useI18n();
  const failed = toolFailed(entry);
  const resultLabel = entry.result === null ? t('runs.log.tool.pending') : failed ? t('runs.log.tool.error') : t('runs.log.tool.result');
  return (
    <div className="log-tool__details">
      <p className="log-tool__label small-caps">{t('runs.log.tool.input')}</p>
      <pre className="log-tool__block">{formatToolInput(entry.input)}</pre>
      <p className="log-tool__label small-caps">{resultLabel}</p>
      {entry.result === null ? null : <pre className={`log-tool__block${failed ? ' is-error' : ''}`}>{entry.result.content}</pre>}
    </div>
  );
}

interface ToolEntryRowProps {
  readonly entry: ToolEntry;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

/** A tool call on one line, opening onto its input and its result. */
export function ToolEntryRow({ entry, expanded, onToggle }: ToolEntryRowProps) {
  const { fmt } = useI18n();
  const input = toolInputHints(entry.input).primary;
  const elapsed = entry.result === null ? null : fmt.duration(toEpoch(entry.result.at) - toEpoch(entry.at));
  return (
    <LogRowFrame entry={entry} icon={<ToolMark entry={entry} />} tone={toolFailed(entry) ? 'failed' : 'default'}>
      <button type="button" className="log-tool__summary" aria-expanded={expanded} onClick={onToggle}>
        <ChevronRight size={MARK_SIZE} className="log-tool__chevron" aria-hidden="true" />
        <span className="log-tool__name">{entry.toolName}</span>
        {input === null ? null : <span className="log-tool__input mono truncate">{truncate(firstLine(input), INPUT_PREVIEW_MAX_LENGTH)}</span>}
        {elapsed === null ? null : <span className="log-tool__duration num">{elapsed}</span>}
      </button>
      {expanded ? <ToolDetails entry={entry} /> : null}
    </LogRowFrame>
  );
}
