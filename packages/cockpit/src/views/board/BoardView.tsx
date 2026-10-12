import './board.css';
import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CircleCheck, Coffee, Search } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import { useBoard } from '../../app/derived.ts';
import { useSnapshot } from '../../app/hooks.ts';
import type { BoardColumnId, BoardFilter } from '../../model/board.ts';
import { BOARD_COLUMN_TITLES, BOARD_COLUMNS, EMPTY_BOARD_FILTER, filterBoard } from '../../model/board.ts';
import { Column } from '../../ui/components/Column.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Kbd } from '../../ui/components/Kbd.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import { BoardCard } from './BoardCard.tsx';
import { BoardFilterMenu } from './BoardFilterMenu.tsx';
import type { CardPosition } from './board-navigation.ts';
import { cardRefKey, nextCardPosition } from './board-navigation.ts';

const FOCUS_FILTER_KEY = '/';

const EMPTY_COPY: Readonly<Record<BoardColumnId, { readonly title: string; readonly description: string }>> = {
  'needs-you': { title: 'Rien ne vous attend', description: 'Les specs à valider, merges, questions et escalades apparaîtront ici.' },
  'in-progress': { title: 'Usine au repos', description: 'Aucun run ni pipeline en cours.' },
  done: { title: 'Rien de terminé cette semaine', description: 'Les éléments terminés des 7 derniers jours apparaîtront ici.' },
};

const EMPTY_ICONS: Readonly<Record<BoardColumnId, ReactNode>> = {
  'needs-you': <Coffee size={16} />,
  'in-progress': <Activity size={16} />,
  done: <CircleCheck size={16} />,
};

function BoardSkeleton() {
  return (
    <div className="board__columns" aria-busy="true" aria-label="Chargement du tableau">
      {BOARD_COLUMNS.map((column) => (
        <div key={column} className="ds-column board-skeleton">
          <Skeleton width="40%" height={10} />
          <Skeleton height={112} />
          <Skeleton height={112} />
        </div>
      ))}
    </div>
  );
}

export function BoardView() {
  const snapshot = useSnapshot();
  const board = useBoard();
  const now = useNow();
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_BOARD_FILTER);
  const [mobileColumn, setMobileColumn] = useState<BoardColumnId>('needs-you');
  const [focused, setFocused] = useState<CardPosition>({ column: 0, row: 0 });
  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef(new Map<string, HTMLAnchorElement>());
  const visible = useMemo(() => filterBoard(board, filter), [board, filter]);
  const columnLengths = BOARD_COLUMNS.map((column) => visible.columns[column].length);

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

  const onCardKeyDown = (position: CardPosition) => (event: KeyboardEvent<HTMLAnchorElement>) => {
    const next = nextCardPosition(position, event.key, columnLengths);
    if (next === null) return;
    const column = BOARD_COLUMNS[next.column];
    if (column === undefined) return;
    event.preventDefault();
    setFocused(next);
    setMobileColumn(column);
    cardRefs.current.get(cardRefKey(column, next.row))?.focus();
  };

  const firstFocusable = columnLengths.findIndex((length) => length > 0);
  const tabStop = (columnLengths[focused.column] ?? 0) > focused.row ? focused : { column: Math.max(0, firstFocusable), row: 0 };

  return (
    <div className="board">
      <header className="board__header">
        <h1 className="board__title">
          Tableau <span className="board__total num">{visible.total} au total</span>
        </h1>
        <div className="board__toolbar">
          <label className="board__search">
            <Search size={15} aria-hidden="true" />
            <span className="visually-hidden">Filtrer le tableau</span>
            <input
              ref={searchRef}
              type="search"
              placeholder="Filtrer par issue, demande, branche ou agent…"
              value={filter.query}
              onChange={(event) => setFilter({ ...filter, query: event.currentTarget.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setFilter({ ...filter, query: '' });
              }}
            />
            <Kbd>/</Kbd>
          </label>
          <BoardFilterMenu filter={filter} onChange={setFilter} />
        </div>
      </header>
      <div className="board__switcher">
        <Segmented
          label="Colonne affichée"
          value={mobileColumn}
          onChange={setMobileColumn}
          items={BOARD_COLUMNS.map((column) => ({ id: column, label: BOARD_COLUMN_TITLES[column], count: visible.columns[column].length }))}
        />
      </div>
      {snapshot === null ? (
        <BoardSkeleton />
      ) : (
        <div className="board__columns">
          {BOARD_COLUMNS.map((column, columnIndex) => {
            const cards = visible.columns[column];
            return (
              <div key={column} className={`board__column${mobileColumn === column ? ' is-current' : ''}`}>
                <Column id={`board-${column}`} title={BOARD_COLUMN_TITLES[column]} count={cards.length} accent={column === 'needs-you'}>
                  {cards.length === 0 ? (
                    <EmptyState compact icon={EMPTY_ICONS[column]} title={EMPTY_COPY[column].title} description={EMPTY_COPY[column].description} />
                  ) : (
                    cards.map((card, row) => (
                      <BoardCard
                        key={card.key}
                        card={card}
                        now={now}
                        tabIndex={tabStop.column === columnIndex && tabStop.row === row ? 0 : -1}
                        cardRef={(element) => {
                          const key = cardRefKey(column, row);
                          if (element === null) cardRefs.current.delete(key);
                          else cardRefs.current.set(key, element);
                        }}
                        onKeyDown={onCardKeyDown({ column: columnIndex, row })}
                      />
                    ))
                  )}
                </Column>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
