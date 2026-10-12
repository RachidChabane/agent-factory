import type { KeyboardEvent, Ref } from 'react';
import { useId } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, CircleDot, GitBranch, GitPullRequest, Inbox, SquareCheck } from 'lucide-react';
import type { Translate } from '../../i18n/create-i18n.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { Vocabulary } from '../../i18n/vocabulary.ts';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { canValidateSpec } from '../../model/actions.ts';
import type { BoardCard as BoardCardModel, BoardItemKind, PullRequestCard } from '../../model/board.ts';
import type { StatusMark as StatusMarkKind } from '../../model/status.ts';
import { Avatar } from '../../ui/components/Avatar.tsx';
import { AgentGlyph } from '../../ui/components/AgentGlyph.tsx';
import { RoleGlyph } from '../../ui/components/RoleGlyph.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { CommandButton } from '../../widgets/CommandButton.tsx';
import { ProjectTag } from '../../widgets/ProjectTag.tsx';
import { Time } from '../../widgets/Time.tsx';

const KIND_ICONS: Readonly<Record<BoardItemKind, LucideIcon>> = {
  request: Inbox,
  issue: CircleDot,
  'pull-request': GitPullRequest,
};

function checksText(mark: StatusMarkKind, t: Translate): string {
  switch (mark) {
    case 'success':
      return t('board.card.checksPassing');
    case 'failed':
      return t('board.card.checksFailing');
    case 'running':
      return t('board.card.checksRunning');
    default:
      return t('board.card.checksNone');
  }
}

function checksPhrase(card: PullRequestCard, t: Translate): string {
  if (card.checksReading === 'unread') return t('board.card.checksUnknown');
  const status = checksText(card.checksMark, t);
  return card.checksReading === 'stale' ? t('board.card.stale', { text: status }) : status;
}

function pullRequestStep(card: PullRequestCard, t: Translate, vocabulary: Vocabulary): string {
  return [
    vocabulary.issueState(card.issueState),
    t('board.card.issue', { number: card.issueNumber }),
    checksPhrase(card, t),
    card.evidenceComplete ? t('board.card.evidenceComplete') : t('board.card.evidenceIncomplete'),
  ].join(' · ');
}

/** The line under the title of a card: the state of its subject and the facts that matter at that state. */
export function cardStep(card: BoardCardModel, t: Translate, vocabulary: Vocabulary): string {
  switch (card.kind) {
    case 'pull-request':
      return pullRequestStep(card, t, vocabulary);
    case 'request':
      return [vocabulary.requestState(card.state), card.owner, card.points > 0 ? t('board.card.points', { count: card.points }) : null].filter((part): part is string => part !== null).join(' · ');
    case 'issue':
      return [
        vocabulary.issueState(card.state),
        card.role === null || card.liveRunId === null ? null : vocabulary.role(card.role),
        card.attempt === null ? null : t('board.card.attempt', { number: card.attempt }),
        card.blockedBy.length > 0 ? t('board.card.waitingFor', { issues: card.blockedBy.map((number) => `#${number}`).join(', ') }) : null,
        card.paused ? t('board.card.paused') : null,
      ]
        .filter((part): part is string => part !== null)
        .join(' · ');
  }
}

function CardOwner({ card }: { readonly card: BoardCardModel }) {
  const vocabulary = useVocabulary();
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
      <Avatar icon={card.role === null ? <GitBranch size={11} /> : <RoleGlyph role={card.role} size={11} />} />
      <span className="board-card__owner truncate">{card.role === null ? card.reference : vocabulary.role(card.role)}</span>
    </>
  );
}

interface BoardCardProps {
  readonly card: BoardCardModel;
  readonly showProject: boolean;
  readonly cardRef?: Ref<HTMLAnchorElement> | undefined;
  readonly onKeyDown?: ((event: KeyboardEvent<HTMLAnchorElement>) => void) | undefined;
  readonly tabIndex?: number | undefined;
}

/** The command a card offers on the spot, when its subject waits for exactly one decision of the operator. */
function ValidateSpecAction({ card }: { readonly card: BoardCardModel }) {
  const { t } = useI18n();
  if (card.kind !== 'issue' || !canValidateSpec(card)) return null;
  return (
    <div className="board-card__actions">
      <CommandButton command="issue.validate-spec" body={{ project: card.project, issueNumber: card.number }} size="sm" variant="primary" icon={<SquareCheck size={13} />}>
        {t('issues.action.validate')}
      </CommandButton>
    </div>
  );
}

export function BoardCard({ card, showProject, cardRef, onKeyDown, tabIndex }: BoardCardProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const titleId = useId();
  const KindIcon = KIND_ICONS[card.kind];
  const live = card.liveRunId !== null;
  const offersValidation = card.kind === 'issue' && canValidateSpec(card);
  return (
    <article className={`board-card${card.column === 'delivered' ? ' board-card--done' : ''}${live ? ' board-card--live' : ''}`} aria-labelledby={titleId}>
      <Link ref={cardRef} to={card.href} className="board-card__link" onKeyDown={onKeyDown} tabIndex={tabIndex} data-card-key={card.key}>
        <div className="board-card__head">
          <span className="board-card__glyph" aria-hidden="true">
            {live ? <AgentGlyph size={15} /> : <KindIcon size={14} />}
          </span>
          <h3 className="board-card__title" id={titleId}>
            <span className="board-card__reference">{card.reference}</span> {card.title}
          </h3>
          <StatusMark mark={card.mark} />
        </div>
        <div className="board-card__preview">
          <p className="board-card__step truncate">{cardStep(card, t, vocabulary)}</p>
          {card.detail === null ? null : (
            <p className="board-card__detail">
              {live && card.detailFromAgent ? <span className="board-card__speaker">{t('common.agentName')}</span> : null}
              {card.detail}
            </p>
          )}
        </div>
        {card.runningSubagents > 0 ? (
          <p className="board-card__subagents">
            <ChevronRight size={12} aria-hidden="true" />
            {t('board.card.subagents', { count: card.runningSubagents })}
          </p>
        ) : null}
        <div className="board-card__footer">
          {showProject ? <ProjectTag project={card.project} /> : null}
          <CardOwner card={card} />
          {card.attention === null || offersValidation ? null : <span className="board-card__attention">{t(`attention.${card.attention}`)}</span>}
          <Time iso={card.updatedAt} className="board-card__time num" />
        </div>
      </Link>
      <ValidateSpecAction card={card} />
    </article>
  );
}
