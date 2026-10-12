import './overview.css';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ExternalLink, GitBranch, Plus } from 'lucide-react';
import { ActivityList } from '../../app/ActivityFeed.tsx';
import { useAttention } from '../../app/derived.ts';
import { useBoard, useNavigationCounts } from '../../app/derived.ts';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { EnvironmentView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { filterBoard, EMPTY_BOARD_FILTER } from '../../model/board.ts';
import { paths } from '../../model/routes.ts';
import { environmentMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Card, Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { Page } from '../../ui/layout/Page.tsx';
import { NewRequestDialog } from '../../widgets/NewRequestDialog.tsx';
import { PausePanel } from '../../widgets/PausePanel.tsx';
import { ReadStamp } from '../../widgets/ReadStamp.tsx';
import { Time } from '../../widgets/Time.tsx';
import { BoardColumns } from '../board/BoardColumns.tsx';
import { LiveRuns } from '../board/LiveRuns.tsx';

function DeploymentSummary({ environment }: { readonly environment: EnvironmentView }) {
  const { t } = useI18n();
  const reading = environment.deployments;
  if (reading === null) return <p className="overview-environment__deployment subtle">{t('overview.noDeploymentSource')}</p>;
  if (reading.value === null) {
    return <p className="overview-environment__deployment subtle">{reading.error === null ? t('overview.deploymentsUnread') : t('reading.failed', { error: reading.error })}</p>;
  }
  const current = reading.value.current;
  return (
    <div className="overview-environment__deployment">
      {current === null ? (
        <p className="subtle">{t('overview.noDeploymentYet')}</p>
      ) : (
        <p>
          {t('overview.deployed', { version: current.version })} · <Time iso={current.deployedAt} />
        </p>
      )}
      <ReadStamp readAt={reading.readAt} error={reading.error} kind="forge" />
    </div>
  );
}

function EnvironmentSummary({ environment, projectId }: { readonly environment: EnvironmentView; readonly projectId: string }) {
  const vocabulary = useVocabulary();
  return (
    <li className="overview-environment">
      <div className="overview-environment__head">
        <StatusMark mark={environmentMark(environment.status)} label={vocabulary.environmentStatus(environment.status)} />
        <Link to={paths.delivery(projectId)} className="overview-environment__name">
          {environment.name}
        </Link>
        <Badge tone={environment.production ? 'accent' : 'neutral'}>{vocabulary.promotionPolicy(environment.promotion)}</Badge>
        <span className="overview-environment__status subtle">{vocabulary.environmentStatus(environment.status)}</span>
      </div>
      <DeploymentSummary environment={environment} />
    </li>
  );
}

export function ProjectOverview() {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const snapshot = useSnapshot();
  const attention = useAttention(project.id);
  const counts = useNavigationCounts(project.id);
  const board = useBoard();
  const [creating, setCreating] = useState(false);
  const visible = useMemo(() => filterBoard(board, { ...EMPTY_BOARD_FILTER, project: project.id }), [board, project.id]);
  const openIssues = project.issues.filter((issue) => issue.state !== 'closed' && issue.state !== 'abandoned').length;
  const stats = [
    { id: 'issues', label: t('overview.stats.issues'), value: openIssues, to: paths.issues(project.id), hint: t('overview.stat.hint.issues', { count: project.issues.length }) },
    { id: 'pull-requests', label: t('overview.stats.pullRequests'), value: counts.openPullRequests, to: paths.pullRequests(project.id), hint: null },
    { id: 'runs', label: t('overview.stats.runs'), value: counts.liveRuns, to: paths.runs(project.id), hint: null },
    { id: 'requests', label: t('overview.stats.requests'), value: counts.requestsToHandle, to: paths.requests(project.id), hint: null },
    { id: 'audits', label: t('overview.stats.audits'), value: counts.auditsToHandle, to: paths.audits(project.id), hint: null },
    { id: 'releases', label: t('overview.stats.releases'), value: counts.releasesToHandle, to: paths.releases(project.id), hint: null },
  ];
  return (
    <Page width="full" className="overview">
      <header className="overview__header">
        <div className="overview__heading">
          <h1 className="overview__title">{project.name}</h1>
          <p className="overview__subtitle">
            <GitBranch size={13} aria-hidden="true" />
            <span className="mono">{t('overview.subtitle', { repository: project.repository, branch: project.baseBranch })}</span>
            <Badge>{vocabulary.forgeKind(project.forge.kind)}</Badge>
            {project.forge.url === null ? null : (
              <a className="link overview__forge-link" href={project.forge.url} target="_blank" rel="noreferrer">
                {t('overview.openForge')} <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
          {t('board.newRequest')}
        </Button>
      </header>

      <ul className="overview-stats" aria-label={t('overview.stats.list')}>
        {stats.map((stat) => (
          <li key={stat.id}>
            <Link to={stat.to} className="overview-stat">
              <span className="overview-stat__label">{stat.label}</span>
              <span className="overview-stat__value num">{stat.value}</span>
              {stat.hint === null ? null : <span className="overview-stat__hint">{stat.hint}</span>}
            </Link>
          </li>
        ))}
      </ul>

      <div className="overview__grid">
        <Section title={t('overview.attention')} id="overview-attention">
          {attention.length === 0 ? (
            <EmptyState compact title={t('overview.attentionEmpty')} />
          ) : (
            <Card padded={false}>
              <ul className="overview-attention">
                {attention.map((item) => (
                  <li key={item.key}>
                    <Link to={item.href} className="overview-attention__item">
                      <span className="overview-attention__text">
                        <span className="overview-attention__title truncate">
                          <span className="subtle">{item.reference}</span> {item.title}
                        </span>
                        <span className="overview-attention__kind">{t(`attention.${item.kind}`)}</span>
                      </span>
                      <Time iso={item.at} className="num subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>
        <Section title={t('pause.heading')} id="overview-pauses">
          <PausePanel
            scopes={[
              { project: project.id, pauses: project.pauses },
              { project: null, pauses: snapshot.installation.pauses },
            ]}
          />
        </Section>
      </div>

      <Section title={t('overview.board')} id="overview-board">
        <LiveRuns project={project.id} />
        <div className="overview__board">
          <BoardColumns board={visible} showProject={false} />
        </div>
      </Section>

      <div className="overview__grid">
        <Section
          title={t('overview.environments')}
          id="overview-environments"
          actions={
            <Link to={paths.delivery(project.id)} className="link">
              {t('overview.openDelivery')}
            </Link>
          }
        >
          {project.environments.length === 0 ? (
            <EmptyState compact title={t('overview.environmentsEmpty')} />
          ) : (
            <Card padded={false}>
              <ul className="overview-environments">
                {project.environments.map((environment) => (
                  <EnvironmentSummary key={environment.name} environment={environment} projectId={project.id} />
                ))}
              </ul>
            </Card>
          )}
        </Section>
        <Section title={t('overview.activity')} id="overview-activity">
          <Card padded={false}>
            <div className="overview__activity">
              <ActivityList project={project.id} limit={12} />
            </div>
          </Card>
        </Section>
      </div>
      <NewRequestDialog open={creating} onClose={() => setCreating(false)} projectId={project.id} pickProject={false} />
    </Page>
  );
}
