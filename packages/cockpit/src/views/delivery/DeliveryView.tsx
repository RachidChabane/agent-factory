import './delivery.css';
import { useMemo, useState } from 'react';
import { useNow } from '../../app/context.tsx';
import { useCommand, useSnapshot } from '../../app/hooks.ts';
import { ENVIRONMENTS } from '../../contract/index.ts';
import type { EnvironmentView } from '../../contract/index.ts';
import { ENVIRONMENT_LABELS } from '../../i18n/labels.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { Dialog } from '../../ui/components/Dialog.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import type { RedeployTarget, WorkflowFilter } from './delivery-model.ts';
import { filterWorkflows, newestFirst, WORKFLOW_FILTER_LABELS, WORKFLOW_FILTERS } from './delivery-model.ts';
import { EnvironmentCard } from './EnvironmentCard.tsx';
import { WorkflowTable } from './WorkflowTable.tsx';

const REDEPLOY_SUCCESS = 'Redéploiement lancé';
const SKELETON_CARD_HEIGHT = 260;
const SKELETON_TABLE_HEIGHT = 280;

function redeployTitle(environment: EnvironmentView | undefined, target: RedeployTarget): string {
  const label = ENVIRONMENT_LABELS[target];
  const version = environment?.current?.version;
  return version === undefined ? `Redéployer ${label} ?` : `Redéployer ${version} sur ${label} ?`;
}

function DeliverySkeleton() {
  return (
    <div className="delivery-skeleton" aria-busy="true" aria-label="Chargement des déploiements">
      <div className="delivery-envs">
        {ENVIRONMENTS.map((name) => (
          <Skeleton key={name} height={SKELETON_CARD_HEIGHT} />
        ))}
      </div>
      <Skeleton height={SKELETON_TABLE_HEIGHT} />
    </div>
  );
}

export function DeliveryView() {
  const snapshot = useSnapshot();
  const now = useNow();
  const command = useCommand();
  const [filter, setFilter] = useState<WorkflowFilter>('all');
  const [target, setTarget] = useState<RedeployTarget | null>(null);
  const runs = useMemo(() => (snapshot === null ? [] : newestFirst(snapshot.workflows)), [snapshot]);
  const visibleRuns = useMemo(() => filterWorkflows(runs, filter), [runs, filter]);

  const environments = snapshot === null ? [] : ENVIRONMENTS.flatMap((name) => snapshot.environments.filter((environment) => environment.name === name));
  const targetEnvironment = environments.find((environment) => environment.name === target);
  const deployedVersion = targetEnvironment?.current?.version ?? null;

  const confirmRedeploy = async () => {
    if (target === null || deployedVersion === null) return;
    await command.run('deployment.redeploy', { environment: target, confirmVersion: deployedVersion }, REDEPLOY_SUCCESS);
    setTarget(null);
  };

  return (
    <Page>
      <PageHeader title="CI & déploiements" description="État des trois environnements, redéploiement de DEV et PREP, et exécutions récentes des workflows GitHub." />
      {snapshot === null ? (
        <DeliverySkeleton />
      ) : (
        <>
          <Section title="Environnements" id="delivery-environments">
            <div className="delivery-envs">
              {environments.map((environment) => (
                <EnvironmentCard key={environment.name} environment={environment} now={now} onRedeploy={setTarget} />
              ))}
            </div>
          </Section>
          <Section
            title="Exécutions de workflows"
            id="delivery-workflows"
            actions={
              <Segmented
                label="Filtrer les exécutions"
                size="sm"
                value={filter}
                onChange={setFilter}
                items={WORKFLOW_FILTERS.map((id) => ({ id, label: WORKFLOW_FILTER_LABELS[id] }))}
              />
            }
          >
            <div className="delivery-workflows">
              <WorkflowTable runs={visibleRuns} now={now} />
            </div>
          </Section>
        </>
      )}
      <Dialog
        open={target !== null}
        onClose={() => setTarget(null)}
        size="sm"
        title={target === null ? '' : redeployTitle(targetEnvironment, target)}
        description="Le workflow de déploiement sera relancé avec la version actuellement déployée."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={deployedVersion === null}
              loading={command.pending === 'deployment.redeploy'}
              onClick={() => void confirmRedeploy()}
            >
              Confirmer le redéploiement
            </Button>
          </>
        }
      />
    </Page>
  );
}
