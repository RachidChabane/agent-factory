import { ArrowDownToLine, Braces, Search } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import type { LogFilter, LogFilterCounts } from './run-log-model.ts';
import { LOG_FILTERS } from './run-log-model.ts';

const ICON_SIZE = 13;

interface LogToolbarProps {
  readonly filter: LogFilter;
  readonly onFilter: (filter: LogFilter) => void;
  readonly counts: LogFilterCounts;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly showRaw: boolean;
  readonly onToggleRaw: () => void;
  readonly lineCount: number;
  /** Whether the agent can still write to the log, which is when following it means something. */
  readonly live: boolean;
  readonly follow: boolean;
  readonly onToggleFollow: () => void;
}

export function LogToolbar({ filter, onFilter, counts, query, onQuery, showRaw, onToggleRaw, lineCount, live, follow, onToggleFollow }: LogToolbarProps) {
  const { t } = useI18n();
  return (
    <div className="log-viewer__toolbar">
      <Segmented<LogFilter>
        size="sm"
        label={t('runs.log.filters')}
        value={filter}
        onChange={onFilter}
        items={LOG_FILTERS.map((entry) => ({ id: entry, label: t(`runs.log.filter.${entry}`), count: counts[entry] }))}
      />
      <label className="log-viewer__search">
        <Search size={ICON_SIZE} aria-hidden="true" />
        <span className="visually-hidden">{t('runs.log.search')}</span>
        <input type="search" placeholder={t('runs.log.searchPlaceholder')} value={query} onChange={(event) => onQuery(event.currentTarget.value)} />
      </label>
      <Button size="sm" variant={showRaw ? 'secondary' : 'ghost'} icon={<Braces size={ICON_SIZE} />} aria-pressed={showRaw} title={t('runs.log.rawHint')} onClick={onToggleRaw}>
        {t('runs.log.raw')}
      </Button>
      <span className="log-viewer__count num">{t('runs.log.lineCount', { count: lineCount })}</span>
      {live ? (
        <Button size="sm" variant={follow ? 'secondary' : 'ghost'} icon={<ArrowDownToLine size={ICON_SIZE} />} aria-pressed={follow} onClick={onToggleFollow}>
          {t('runs.log.follow')}
        </Button>
      ) : null}
    </div>
  );
}
