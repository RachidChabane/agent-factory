import './releases.css';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { Rocket } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { ReleaseView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { releaseMark } from '../../model/status.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ListItemLink, ListPane, ListSection, SplitLayout } from '../../ui/layout/Page.tsx';
import { Time } from '../../widgets/Time.tsx';
import { ReleaseDetail } from './ReleaseDetail.tsx';
import type { ReleaseGroup } from './release-model.ts';
import { groupReleases, RELEASE_GROUPS, releaseActivityAt } from './release-model.ts';

function ReleaseListItem({ release, projectId, active }: { readonly release: ReleaseView; readonly projectId: string; readonly active: boolean }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <ListItemLink to={paths.release(projectId, release.id)} active={active}>
      <StatusMark mark={releaseMark(release.state, release.supersededBy)} />
      <span className="list-item__body">
        <span className="list-item__title">{release.title}</span>
        <span className="list-item__meta">
          <span className="truncate">{release.supersededBy === null ? vocabulary.releaseState(release.state) : t('releases.supersededBy', { version: release.supersededBy })}</span>
          <span className="dot-separator" />
          <span>{vocabulary.releaseSource(release.source)}</span>
          <span className="dot-separator" />
          <span className="num">{t('releases.commitCount', { count: release.commits.length })}</span>
        </span>
      </span>
      <span className="list-item__aside">
        <Time iso={releaseActivityAt(release)} className="num" />
      </span>
    </ListItemLink>
  );
}

export function ReleasesView() {
  const { t } = useI18n();
  const project = useProject();
  const { releaseId } = useParams();
  const groups = useMemo(() => groupReleases(project.releases), [project.releases]);
  const ordered = RELEASE_GROUPS.flatMap((group) => groups[group]);
  const selected = releaseId === undefined ? (ordered[0] ?? null) : (project.releases.find((release) => release.id === releaseId) ?? null);
  const headings: Readonly<Record<ReleaseGroup, string>> = {
    current: t('releases.group.current'),
    verified: t('releases.group.verified'),
    superseded: t('releases.group.superseded'),
  };
  const untracked = project.settings.releaseModel === 'none';
  return (
    <SplitLayout
      listWidth="narrow"
      listLabel={t('releases.listLabel')}
      hasSelection={releaseId !== undefined}
      list={
        <ListPane title={t('releases.title')} count={project.releases.length}>
          {project.releases.length === 0 ? (
            <EmptyState compact icon={<Rocket size={16} />} title={untracked ? t('releases.emptyNoModel') : t('releases.empty')} description={untracked ? t('releases.emptyNoModelDescription') : t('releases.emptyDescription')} />
          ) : null}
          {RELEASE_GROUPS.map((group) =>
            groups[group].length === 0 ? null : (
              <ListSection key={group} title={headings[group]} count={groups[group].length}>
                {groups[group].map((release) => (
                  <ReleaseListItem key={release.id} release={release} projectId={project.id} active={release.id === selected?.id} />
                ))}
              </ListSection>
            ),
          )}
        </ListPane>
      }
      detail={
        selected === null ? (
          releaseId === undefined ? null : <EmptyState icon={<Rocket size={16} />} headingLevel={2} title={t('releases.notFound')} description={t('releases.notFoundDescription')} />
        ) : (
          <ReleaseDetail key={selected.id} release={selected} />
        )
      }
    />
  );
}
