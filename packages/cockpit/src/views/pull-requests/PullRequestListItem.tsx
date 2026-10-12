import { GitMerge } from 'lucide-react';
import type { PullRequestView } from '../../contract/index.ts';
import type { Translate } from '../../i18n/create-i18n.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import type { StatusMark as StatusMarkKind } from '../../model/status.ts';
import { pullRequestMark } from '../../model/status.ts';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ListItemLink } from '../../ui/layout/Page.tsx';
import { Time } from '../../widgets/Time.tsx';
import type { ChecksDigest } from './pull-request-model.ts';
import { digestChecks, mergeAvailability, pullRequestActivityAt } from './pull-request-model.ts';

const MARK_SIZE = 12;

function checksStatus(mark: StatusMarkKind, t: Translate): string {
  switch (mark) {
    case 'failed':
      return t('pullRequests.checksState.failing');
    case 'running':
      return t('pullRequests.checksState.running');
    default:
      return t('pullRequests.checksState.passing');
  }
}

/** What the checks add up to, when the reading holds a value; a reading that holds none has nothing to mark. */
function ChecksMark({ digest }: { readonly digest: ChecksDigest }) {
  const { t } = useI18n();
  if (digest.kind === 'unread') return null;
  return (
    <>
      <span className="dot-separator" />
      {digest.kind === 'counted' ? (
        <StatusMark
          mark={digest.mark}
          size={MARK_SIZE}
          label={t('pullRequests.checksMarkLabel', { status: checksStatus(digest.mark, t), summary: t('pullRequests.checksSummary', { passed: digest.passed, count: digest.total }) })}
        />
      ) : (
        <StatusMark mark="idle" size={MARK_SIZE} label={t('pullRequests.checksNone')} />
      )}
    </>
  );
}

interface PullRequestListItemProps {
  readonly pullRequest: PullRequestView;
  readonly projectId: string;
  readonly active: boolean;
}

export function PullRequestListItem({ pullRequest, projectId, active }: PullRequestListItemProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const checks = digestChecks(pullRequest.checks);
  const ready = mergeAvailability(pullRequest).kind === 'ready';
  return (
    <ListItemLink to={paths.pullRequest(projectId, pullRequest.number)} active={active}>
      <StatusMark mark={pullRequestMark(pullRequest.state)} label={vocabulary.pullRequestState(pullRequest.state)} />
      <span className="list-item__body">
        <span className="list-item__title">{pullRequest.title}</span>
        <span className="list-item__meta">
          <span className="num">#{pullRequest.number}</span>
          <span className="dot-separator" />
          <span className="num">{t('pullRequests.issue', { number: pullRequest.issueNumber })}</span>
          <ChecksMark digest={checks} />
        </span>
        {ready ? (
          <span className="pr-list__ready">
            <GitMerge size={MARK_SIZE} aria-hidden="true" />
            {t('pullRequests.readyToMerge')}
          </span>
        ) : null}
      </span>
      <span className="list-item__aside">
        <Time iso={pullRequestActivityAt(pullRequest)} className="num" />
      </span>
    </ListItemLink>
  );
}
