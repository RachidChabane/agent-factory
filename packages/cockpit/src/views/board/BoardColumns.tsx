import type { KeyboardEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Activity, CircleCheck, Coffee, FileText, GitPullRequest, Inbox, ListChecks } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { Board, BoardColumnId } from '../../model/board.ts';
import { BOARD_COLUMNS } from '../../model/board.ts';
import { Column } from '../../ui/components/Column.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import { BoardCard } from './BoardCard.tsx';
import type { CardPosition } from './board-navigation.ts';
import { cardRefKey, nextCardPosition } from './board-navigation.ts';

const EMPTY_ICONS: Readonly<Record<BoardColumnId, ReactNode>> = {
  requests: <Inbox size={16} />,
  specs: <FileText size={16} />,
  checks: <ListChecks size={16} />,
  implementation: <Activity size={16} />,
  'pull-requests': <GitPullRequest size={16} />,
  'needs-human': <Coffee size={16} />,
  delivered: <CircleCheck size={16} />,
};

interface BoardColumnsProps {
  readonly board: Board;
  readonly showProject: boolean;
}

/** The columns of a board, each with its cards, navigable with the arrow keys and switchable on a narrow screen. */
export function BoardColumns({ board, showProject }: BoardColumnsProps) {
  const { t } = useI18n();
  const [mobileColumn, setMobileColumn] = useState<BoardColumnId>(BOARD_COLUMNS[0]);
  const [focused, setFocused] = useState<CardPosition>({ column: 0, row: 0 });
  const cardRefs = useRef(new Map<string, HTMLAnchorElement>());
  const columnLengths = BOARD_COLUMNS.map((column) => board.columns[column].length);
  const firstFocusable = columnLengths.findIndex((length) => length > 0);
  const tabStop = (columnLengths[focused.column] ?? 0) > focused.row ? focused : { column: Math.max(0, firstFocusable), row: 0 };

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

  return (
    <>
      <div className="board__switcher">
        <Segmented
          label={t('board.columnSwitch')}
          value={mobileColumn}
          onChange={setMobileColumn}
          size="sm"
          items={BOARD_COLUMNS.map((column) => ({ id: column, label: t(`board.column.${column}`), count: board.columns[column].length }))}
        />
      </div>
      <div className="board__columns">
        {BOARD_COLUMNS.map((column, columnIndex) => {
          const cards = board.columns[column];
          return (
            <div key={column} className={`board__column${mobileColumn === column ? ' is-current' : ''}`}>
              <Column id={`board-${column}`} title={t(`board.column.${column}`)} count={cards.length} accent={column === 'needs-human'}>
                {cards.length === 0 ? (
                  <EmptyState compact icon={EMPTY_ICONS[column]} title={t(`board.empty.${column}`)} />
                ) : (
                  cards.map((card, row) => (
                    <BoardCard
                      key={card.key}
                      card={card}
                      showProject={showProject}
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
    </>
  );
}
