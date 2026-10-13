import { Link } from 'react-router';
import { CalendarClock, CircleDot, ExternalLink, GitBranch, GitCommitHorizontal, GitMerge } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { PullRequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { shortSha } from '../../model/identifiers.ts';
import { paths } from '../../model/routes.ts';
import { pullRequestMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DetailHeader, MetaItem } from '../../ui/layout/Page.tsx';
import { Time } from '../../widgets/Time.tsx';
import { mergeBlockerIds } from './MergeBlockers.tsx';
import type { MergeAvailability } from './pull-request-model.ts';

const ICON_SIZE = 14;
const META_ICON_SIZE = 13;

function ForgeLink({ url }: { readonly url: string }) {
  const { t } = useI18n();
  if (url.length === 0) return <span className="subtle">{t('pullRequests.noForgeLink')}</span>;
  return (
    <a className="ds-button ds-button--secondary ds-button--md" href={url} target="_blank" rel="noreferrer">
      <ExternalLink size={ICON_SIZE} aria-hidden="true" />
      <span className="ds-button__label">{t('common.openOnForge')}</span>
    </a>
  );
}

interface PullRequestHeaderProps {
  readonly pullRequest: PullRequestView;
  readonly availability: MergeAvailability;
  /** What the ids of the reasons that block the merge start with: the disabled button points at them. */
  readonly blockersId: string;
  readonly onMerge: () => void;
}

export function PullRequestHeader({ pullRequest, availability, blockersId, onMerge }: PullRequestHeaderProps) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const state = vocabulary.pullRequestState(pullRequest.state);
  return (
    <DetailHeader
      back={{ to: paths.pullRequests(project.id), label: t('pullRequests.back') }}
      eyebrow={
        <>
          <StatusMark mark={pullRequestMark(pullRequest.state)} label={state} />
          <span>{state}</span>
          <span className="num">#{pullRequest.number}</span>
          <Badge>{vocabulary.issueType(pullRequest.type)}</Badge>
        </>
      }
      title={pullRequest.title}
      actions={
        <>
          <ForgeLink url={pullRequest.url} />
          {availability.kind === 'unavailable' ? null : (
            <Button
              variant="primary"
              icon={<GitMerge size={ICON_SIZE} />}
              disabled={availability.kind !== 'ready'}
              aria-describedby={availability.kind === 'blocked' ? mergeBlockerIds(blockersId, availability.blockers) : undefined}
              onClick={onMerge}
            >
              {t('pullRequests.merge.action')}
            </Button>
          )}
        </>
      }
      meta={
        <>
          <MetaItem icon={<GitBranch size={META_ICON_SIZE} />}>
            <span className="visually-hidden">{t('pullRequests.meta.branch')} </span>
            <span className="mono truncate">{pullRequest.branch}</span>
          </MetaItem>
          <MetaItem icon={<GitCommitHorizontal size={META_ICON_SIZE} />}>
            {rich('pullRequests.meta.head', {
              sha: (
                <span className="mono" title={pullRequest.headSha}>
                  {shortSha(pullRequest.headSha)}
                </span>
              ),
            })}
          </MetaItem>
          <MetaItem icon={<CircleDot size={META_ICON_SIZE} />}>
            <Link to={paths.issue(project.id, pullRequest.issueNumber)} className="link">
              {t('pullRequests.issue', { number: pullRequest.issueNumber })}
            </Link>
          </MetaItem>
          <MetaItem icon={<CalendarClock size={META_ICON_SIZE} />}>{rich('pullRequests.meta.opened', { when: <Time iso={pullRequest.openedAt} mode="dateTime" /> })}</MetaItem>
          {pullRequest.mergedAt === null ? null : <MetaItem icon={<GitMerge size={META_ICON_SIZE} />}>{rich('pullRequests.meta.merged', { when: <Time iso={pullRequest.mergedAt} mode="dateTime" /> })}</MetaItem>}
        </>
      }
    />
  );
}
