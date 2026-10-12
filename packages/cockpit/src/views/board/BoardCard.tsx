import type { KeyboardEvent, Ref } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, CircleDot, Folder, GitBranch, Inbox, Rocket, ShieldAlert, SquareTerminal } from 'lucide-react';
import { relativeTime } from '../../format/format.ts';
import { ROLE_LABELS } from '../../i18n/labels.ts';
import type { BoardCard as BoardCardModel, BoardItemKind } from '../../model/board.ts';
import { ATTENTION_LABELS } from '../../model/board.ts';
import { Avatar } from '../../ui/components/Avatar.tsx';
import { RoleGlyph } from '../../ui/components/RoleGlyph.tsx';
import { AgentGlyph } from '../../ui/components/AgentGlyph.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';

const KIND_ICONS: Readonly<Record<BoardItemKind, LucideIcon>> = {
  request: Inbox,
  issue: CircleDot,
  run: SquareTerminal,
  audit: ShieldAlert,
  release: Rocket,
};

function CardOwner({ card }: { readonly card: BoardCardModel }) {
  if (card.branch !== null) {
    return (
      <>
        {card.role === null ? <Avatar icon={<GitBranch size={11} />} /> : <Avatar icon={<RoleGlyph role={card.role} size={11} />} />}
        <span className="board-card__branch truncate">{card.branch}</span>
      </>
    );
  }
  if (card.owner !== null) {
    return (
      <>
        <Avatar name={card.owner} />
        <span className="board-card__owner truncate">{card.owner}</span>
      </>
    );
  }
  return (
    <>
      <Avatar icon={card.role === null ? <Folder size={11} /> : <RoleGlyph role={card.role} size={11} />} />
      <span className="board-card__owner truncate">{card.role === null ? card.reference : ROLE_LABELS[card.role]}</span>
    </>
  );
}

interface BoardCardProps {
  readonly card: BoardCardModel;
  readonly now: number;
  readonly cardRef?: Ref<HTMLAnchorElement> | undefined;
  readonly onKeyDown?: ((event: KeyboardEvent<HTMLAnchorElement>) => void) | undefined;
  readonly tabIndex?: number | undefined;
}

export function BoardCard({ card, now, cardRef, onKeyDown, tabIndex }: BoardCardProps) {
  const KindIcon = KIND_ICONS[card.kind];
  const done = card.column === 'done';
  const subagentLabel = `${card.subagentCount} sous-agent${card.subagentCount > 1 ? 's' : ''}`;
  return (
    <Link
      ref={cardRef}
      to={card.href}
      className={`board-card${done ? ' board-card--done' : ''}${card.live ? ' board-card--live' : ''}`}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      data-card-key={card.key}
    >
      <div className="board-card__head">
        <span className="board-card__glyph" aria-hidden="true">
          {card.live ? <AgentGlyph size={15} /> : <KindIcon size={14} />}
        </span>
        <h3 className="board-card__title">
          <span className="board-card__reference">{card.reference}</span> {card.title}
        </h3>
        <StatusMark mark={card.mark} />
      </div>
      <div className="board-card__preview">
        <p className="board-card__step truncate">{card.step}</p>
        {card.detail === null ? null : (
          <p className="board-card__detail">
            {card.live && card.detailFromAgent ? <span className="board-card__speaker">Claude</span> : null}
            {card.detail}
          </p>
        )}
      </div>
      {card.subagentCount > 0 ? (
        <p className="board-card__subagents">
          <ChevronRight size={12} aria-hidden="true" />
          {subagentLabel}
        </p>
      ) : null}
      <div className="board-card__footer">
        <CardOwner card={card} />
        {card.attention === null ? null : <span className="board-card__attention">{ATTENTION_LABELS[card.attention]}</span>}
        <time className="board-card__time num" dateTime={card.updatedAt}>
          {relativeTime(card.updatedAt, now)}
        </time>
      </div>
    </Link>
  );
}
