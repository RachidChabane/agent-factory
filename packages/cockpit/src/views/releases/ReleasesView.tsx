import './releases.css';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { Rocket } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { ReleaseView } from '../../contract/index.ts';
import { plural, relativeTime, toEpoch } from '../../format/format.ts';
import { RELEASE_STATE_LABELS } from '../../i18n/labels.ts';
import { paths, VIEW_TITLES } from '../../model/routes.ts';
import { releaseMark } from '../../model/status.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ListItemLink, SplitLayout } from '../../ui/layout/Page.tsx';
import { ReleaseDetail } from './ReleaseDetail.tsx';

const ATTENTION_STATES: readonly ReleaseView['state'][] = ['blocked', 'promotable'];

function sortReleases(releases: readonly ReleaseView[]): readonly ReleaseView[] {
  return releases.toSorted(
    (left, right) =>
      Number(ATTENTION_STATES.includes(right.state)) - Number(ATTENTION_STATES.includes(left.state)) || toEpoch(right.createdAt) - toEpoch(left.createdAt),
  );
}

export function ReleasesView() {
  const snapshot = useSnapshot();
  const now = useNow();
  const { releaseId } = useParams();
  const sorted = useMemo(() => sortReleases(snapshot?.releases ?? []), [snapshot]);
  const selected = releaseId === undefined ? (sorted[0] ?? null) : (sorted.find((release) => release.id === releaseId) ?? null);
  if (snapshot === null) {
    return (
      <div className="detail">
        <Skeleton width="40%" height={20} />
        <Skeleton height={240} />
      </div>
    );
  }
  return (
    <SplitLayout
      listWidth="narrow"
      listLabel="Liste des releases"
      hasSelection={releaseId !== undefined}
      list={
        <>
          <header className="list-pane__header">
            <h1 className="list-pane__title">
              {VIEW_TITLES.releases} <span className="list-pane__count num">{sorted.length}</span>
            </h1>
          </header>
          <div className="list-pane__items">
            {sorted.map((release) => (
              <ListItemLink key={release.id} to={paths.release(release.id)} active={release.id === selected?.id}>
                <StatusMark mark={releaseMark(release.state)} />
                <span className="list-item__body">
                  <span className="list-item__title num">{release.id}</span>
                  <span className="list-item__meta">
                    {RELEASE_STATE_LABELS[release.state]} · {plural(release.commits.length, 'commit', 'commits')}
                  </span>
                </span>
                <span className="list-item__aside num">{relativeTime(release.cutAt ?? release.createdAt, now)}</span>
              </ListItemLink>
            ))}
          </div>
        </>
      }
      detail={
        selected === null ? (
          <EmptyState icon={<Rocket size={16} />} title={releaseId === undefined ? 'Aucune release' : 'Release introuvable'} />
        ) : (
          <ReleaseDetail key={selected.id} release={selected} snapshot={snapshot} />
        )
      }
    />
  );
}
