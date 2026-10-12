import './board.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { useBoard } from '../../app/derived.ts';
import { useSnapshot } from '../../app/hooks.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { BoardFilter } from '../../model/board.ts';
import { EMPTY_BOARD_FILTER, filterBoard } from '../../model/board.ts';
import { PROJECT_QUERY_PARAMETER } from '../../model/routes.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Kbd } from '../../ui/components/Kbd.tsx';
import { NewRequestDialog } from '../../widgets/NewRequestDialog.tsx';
import { PausePanel } from '../../widgets/PausePanel.tsx';
import { BoardColumns } from './BoardColumns.tsx';
import { BoardFilterMenu } from './BoardFilterMenu.tsx';
import { LiveRuns } from './LiveRuns.tsx';
import { ProjectFilter } from './ProjectFilter.tsx';

const FOCUS_FILTER_KEY = '/';
const EMPTY_FILTER: Omit<BoardFilter, 'project'> = { query: EMPTY_BOARD_FILTER.query, kinds: EMPTY_BOARD_FILTER.kinds, attentionOnly: EMPTY_BOARD_FILTER.attentionOnly };

export function BoardView() {
  const { t } = useI18n();
  const snapshot = useSnapshot();
  const board = useBoard();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<Omit<BoardFilter, 'project'>>(EMPTY_FILTER);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const requested = searchParams.get(PROJECT_QUERY_PARAMETER);
  const project = snapshot.projects.some((candidate) => candidate.id === requested) ? requested : null;
  const visible = useMemo(() => filterBoard(board, { ...filter, project }), [board, filter, project]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== FOCUS_FILTER_KEY || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select')) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const chooseProject = (next: string | null) => setSearchParams(next === null ? {} : { [PROJECT_QUERY_PARAMETER]: next }, { replace: true });

  return (
    <div className="board">
      <header className="board__header">
        <div className="board__heading">
          <h1 className="board__title">
            {t('board.title')} <span className="board__total num">{t('common.countInTotal', { count: visible.total })}</span>
          </h1>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            {t('board.newRequest')}
          </Button>
        </div>
        <div className="board__toolbar">
          <ProjectFilter value={project} onChange={chooseProject} />
          <label className="board__search">
            <Search size={15} aria-hidden="true" />
            <span className="visually-hidden">{t('board.filter.label')}</span>
            <input
              ref={searchRef}
              type="search"
              placeholder={t('board.filter.placeholder')}
              value={filter.query}
              onChange={(event) => setFilter({ ...filter, query: event.currentTarget.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setFilter({ ...filter, query: '' });
              }}
            />
            <Kbd>{FOCUS_FILTER_KEY}</Kbd>
          </label>
          <BoardFilterMenu filter={filter} onChange={(next) => setFilter({ ...filter, ...next })} />
        </div>
      </header>
      {snapshot.installation.pauses.length === 0 ? null : <PausePanel scopes={[{ project: null, pauses: snapshot.installation.pauses }]} />}
      <LiveRuns project={project} query={filter.query} />
      <BoardColumns board={visible} showProject={project === null && snapshot.projects.length > 1} />
      <NewRequestDialog open={creating} onClose={() => setCreating(false)} projectId={project} pickProject />
    </div>
  );
}
