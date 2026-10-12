import type { Deployment, EnvironmentView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { shortSha } from '../../model/identifiers.ts';
import { deploymentMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import type { TableColumn } from '../../ui/components/Table.tsx';
import { DataTable } from '../../ui/components/Table.tsx';
import { OptionalReadingView } from '../../widgets/ReadingView.tsx';
import { Time } from '../../widgets/Time.tsx';
import { EnvironmentPanel } from './EnvironmentPanel.tsx';
import { ForgeLink } from './ForgeLink.tsx';

type DeploymentHistory = NonNullable<NonNullable<EnvironmentView['deployments']>['value']>;

function Outcome({ deployment }: { readonly deployment: Deployment }) {
  const vocabulary = useVocabulary();
  const label = vocabulary.deploymentOutcome(deployment.outcome);
  return (
    <span className="delivery-status">
      <StatusMark mark={deploymentMark(deployment.outcome)} label={label} />
      {label}
    </span>
  );
}

function CurrentDeployment({ deployment }: { readonly deployment: Deployment }) {
  const { t, rich } = useI18n();
  return (
    <div className="deployment-current">
      <p className="small-caps">{t('delivery.deployments.current')}</p>
      <p className="deployment-current__version mono">{deployment.version}</p>
      <Outcome deployment={deployment} />
      <p className="deployment-current__meta">
        <span className="mono">{t('delivery.deployments.ref', { ref: deployment.ref })}</span>
        <span className="mono">{t('delivery.deployments.commit', { sha: shortSha(deployment.sha) })}</span>
      </p>
      <p className="deployment-current__meta">
        {deployment.actor === null
          ? rich('delivery.deployments.deployedByUnknown', { age: <Time iso={deployment.deployedAt} /> })
          : rich('delivery.deployments.deployedBy', { age: <Time iso={deployment.deployedAt} />, actor: deployment.actor })}
      </p>
      {deployment.workflowUrl === null ? null : (
        <ForgeLink href={deployment.workflowUrl} label={t('delivery.deployments.workflowRunLabel', { version: deployment.version })}>
          {t('delivery.deployments.workflowRun')}
        </ForgeLink>
      )}
    </div>
  );
}

function DeploymentHistoryTable({ environment, history }: { readonly environment: string; readonly history: DeploymentHistory }) {
  const { t } = useI18n();
  const columns: readonly TableColumn<Deployment>[] = [
    {
      id: 'version',
      header: t('delivery.deployments.column.version'),
      cell: (deployment) => (
        <span className="delivery-version">
          <span className="mono">{deployment.version}</span>
          {deployment.id === history.current?.id ? <Badge tone="accent">{t('delivery.deployments.currentBadge')}</Badge> : null}
        </span>
      ),
    },
    { id: 'ref', header: t('delivery.deployments.column.ref'), hideOnMobile: true, cell: (deployment) => <span className="mono">{deployment.ref}</span> },
    { id: 'commit', header: t('delivery.deployments.column.commit'), hideOnMobile: true, cell: (deployment) => <span className="mono">{shortSha(deployment.sha)}</span> },
    { id: 'outcome', header: t('delivery.deployments.column.outcome'), cell: (deployment) => <Outcome deployment={deployment} /> },
    { id: 'deployed', header: t('delivery.deployments.column.deployed'), cell: (deployment) => <Time iso={deployment.deployedAt} className="num" /> },
    { id: 'actor', header: t('delivery.deployments.column.actor'), hideOnMobile: true, cell: (deployment) => deployment.actor ?? <span className="subtle">{t('delivery.deployments.actorUnknown')}</span> },
    {
      id: 'workflow',
      header: <span className="visually-hidden">{t('delivery.deployments.column.workflow')}</span>,
      align: 'end',
      cell: (deployment) =>
        deployment.workflowUrl === null ? null : <ForgeLink href={deployment.workflowUrl} label={t('delivery.deployments.workflowRunLabel', { version: deployment.version })} />,
    },
  ];
  return <DataTable label={t('delivery.deployments.history', { environment })} rows={history.history} columns={columns} rowKey={(deployment) => deployment.id} dense />;
}

function DeploymentsContent({ environment, history }: { readonly environment: string; readonly history: DeploymentHistory }) {
  const { t } = useI18n();
  return (
    <div className="deployments">
      {history.current === null ? <p className="subtle">{t('delivery.deployments.noCurrent')}</p> : <CurrentDeployment deployment={history.current} />}
      {history.history.length === 0 ? null : <DeploymentHistoryTable environment={environment} history={history} />}
    </div>
  );
}

/** What the forge says was deployed on an environment, in each state a reading of it can be in. */
export function DeploymentsPanel({ environment }: { readonly environment: EnvironmentView }) {
  const { t } = useI18n();
  return (
    <EnvironmentPanel title={t('delivery.deployments.title')}>
      <OptionalReadingView
        reading={environment.deployments}
        kind="forge"
        absent={t('delivery.deployments.noSource')}
        notRead={t('delivery.deployments.notRead')}
        isEmpty={(history) => history.current === null && history.history.length === 0}
        empty={t('delivery.deployments.none')}
      >
        {(history) => <DeploymentsContent environment={environment.name} history={history} />}
      </OptionalReadingView>
    </EnvironmentPanel>
  );
}
