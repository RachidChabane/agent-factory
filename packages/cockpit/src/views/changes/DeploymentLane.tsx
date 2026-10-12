import { ExternalLink } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { shortSha } from '../../model/identifiers.ts';
import { deploymentMark, environmentMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ReadStamp } from '../../widgets/ReadStamp.tsx';
import { Time } from '../../widgets/Time.tsx';
import { DeliveredCommits } from '../delivery/CommitList.tsx';
import type { ChangedDeployment, EnvironmentLane } from './changes-model.ts';

const LINK_ICON_SIZE = 13;

function DeploymentEntry({ project, deployment }: { readonly project: string; readonly deployment: ChangedDeployment }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const outcome = vocabulary.deploymentOutcome(deployment.outcome);
  return (
    <Card className="changes-item changes-deployment">
      <div className="changes-deployment__head">
        <StatusMark mark={deploymentMark(deployment.outcome)} label={outcome} />
        <span className="changes-deployment__version mono truncate">{deployment.version}</span>
        {deployment.occurrences > 1 ? <span className="changes-deployment__repeat num">{t('changes.environment.repeated', { count: deployment.occurrences })}</span> : null}
        {deployment.workflowUrl === null ? null : (
          <a className="changes-item__external" href={deployment.workflowUrl} target="_blank" rel="noreferrer" aria-label={t('delivery.deployments.workflowRunLabel', { version: deployment.version })}>
            <ExternalLink size={LINK_ICON_SIZE} aria-hidden="true" />
          </a>
        )}
      </div>
      <p className="changes-item__meta">
        {outcome} · <Time iso={deployment.deployedAt} className="num" /> · {deployment.actor ?? t('delivery.deployments.actorUnknown')} · <span className="mono">{shortSha(deployment.sha)}</span>
      </p>
      <DeliveredCommits project={project} commits={deployment.changes} />
    </Card>
  );
}

function Current({ lane }: { readonly lane: EnvironmentLane }) {
  const { t } = useI18n();
  if (lane.reading === null) return <p className="changes-note">{t('changes.environment.noSource')}</p>;
  if (lane.reading.value === null) return <p className="changes-note">{lane.reading.error === null ? t('changes.environment.notRead') : t('reading.failed', { error: lane.reading.error })}</p>;
  return lane.current === null ? (
    <p className="changes-note">{t('changes.environment.noCurrent')}</p>
  ) : (
    <>
      <span className="changes-current__version mono">{lane.current.version}</span>
      <span className="changes-current__meta">
        <span className="mono">{shortSha(lane.current.sha)}</span> · <Time iso={lane.current.deployedAt} />
      </span>
    </>
  );
}

interface DeploymentLaneProps {
  readonly project: string;
  readonly baseBranch: string;
  readonly lane: EnvironmentLane;
}

/** One environment: what it runs now, the deployments of the period with the commits they brought, and what still waits for it. */
export function DeploymentLane({ project, baseBranch, lane }: DeploymentLaneProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <section className="changes-lane" aria-label={t('changes.environment.lane', { environment: lane.name })}>
      <header className="changes-lane__header">
        <h3 className="changes-lane__name">{lane.name}</h3>
        {lane.production ? <Badge tone="accent">{t('changes.environment.production')}</Badge> : null}
        <span className="changes-lane__status">
          <StatusMark mark={environmentMark(lane.status)} label={vocabulary.environmentStatus(lane.status)} />
          {vocabulary.environmentStatus(lane.status)}
        </span>
        <span className="changes-lane__count num">{lane.deployments.length}</span>
      </header>
      <Card tone="inset" className="changes-current">
        <Current lane={lane} />
        {lane.reading === null ? null : <ReadStamp readAt={lane.reading.readAt} error={lane.reading.error} kind="forge" />}
      </Card>
      {lane.reading?.value === null || lane.reading === null ? null : lane.deployments.length === 0 ? (
        <Card>
          <EmptyState compact title={t('changes.environment.none')} />
        </Card>
      ) : (
        <ul className="changes-lane__list">
          {lane.deployments.map((deployment) => (
            <li key={deployment.id}>
              <DeploymentEntry project={project} deployment={deployment} />
            </li>
          ))}
        </ul>
      )}
      {lane.pendingApplies && lane.current !== null ? (
        <Card className="changes-pending" role="group" aria-label={t('changes.environment.pending', { environment: lane.name })}>
          <h4 className="small-caps">{t('delivery.commits.pending.title')}</h4>
          {lane.pending === null ? (
            <p className="changes-note">{t('delivery.commits.pending.unknown', { branch: baseBranch })}</p>
          ) : lane.pending.length === 0 ? (
            <p className="changes-note">{t('delivery.commits.pending.none', { branch: baseBranch })}</p>
          ) : (
            <>
              <p className="changes-note">{t('delivery.commits.pending.count', { count: lane.pending.length, branch: baseBranch })}</p>
              <DeliveredCommits project={project} commits={lane.pending} />
            </>
          )}
        </Card>
      ) : null}
    </section>
  );
}
