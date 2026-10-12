import { ExternalLink, RotateCw } from 'lucide-react';
import type { EnvironmentView } from '../../contract/index.ts';
import { relativeTime, shortSha } from '../../format/format.ts';
import { DEPLOYMENT_OUTCOME_LABELS, ENVIRONMENT_LABELS, ENVIRONMENT_STATUS_LABELS } from '../../i18n/labels.ts';
import { deploymentMark, environmentMark } from '../../model/status.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import type { RedeployTarget } from './delivery-model.ts';
import { HISTORY_LIMIT, redeployTarget } from './delivery-model.ts';

const PRODUCTION_NOTE = 'La production se déploie depuis son workflow, jamais par l’usine.';
const NO_DEPLOYMENT_LABEL = 'Aucun déploiement enregistré';
const DEPLOYING_STATUS = 'deploying';

interface EnvironmentCardProps {
  readonly environment: EnvironmentView;
  readonly now: number;
  readonly onRedeploy: (target: RedeployTarget) => void;
}

function RedeployControl({ environment, onRedeploy }: Pick<EnvironmentCardProps, 'environment' | 'onRedeploy'>) {
  const target = redeployTarget(environment.name);
  if (target === null) return <p className="delivery-env__note">{PRODUCTION_NOTE}</p>;
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={<RotateCw size={14} />}
      aria-label={`Redéployer ${ENVIRONMENT_LABELS[environment.name]}`}
      disabled={environment.status === DEPLOYING_STATUS}
      onClick={() => onRedeploy(target)}
    >
      Redéployer
    </Button>
  );
}

export function EnvironmentCard({ environment, now, onRedeploy }: EnvironmentCardProps) {
  const label = ENVIRONMENT_LABELS[environment.name];
  const current = environment.current;
  return (
    <Card className="delivery-env" aria-label={`Environnement ${label}`} role="group">
      <header className="delivery-env__header">
        <div className="delivery-env__identity">
          <StatusMark mark={environmentMark(environment.status)} label={ENVIRONMENT_STATUS_LABELS[environment.status]} />
          <h3 className="delivery-env__name">{label}</h3>
          <span className="delivery-env__status">{ENVIRONMENT_STATUS_LABELS[environment.status]}</span>
        </div>
        <a className="link delivery-env__url mono truncate" href={environment.url} target="_blank" rel="noreferrer">
          {environment.url.replace(/^https?:\/\//, '')}
        </a>
      </header>
      {current === null ? (
        <p className="delivery-env__empty">{NO_DEPLOYMENT_LABEL}</p>
      ) : (
        <div className="delivery-env__current">
          <span className="delivery-env__version mono">{current.version}</span>
          <span className="delivery-env__sha mono">{shortSha(current.sha)}</span>
          <p className="delivery-env__meta">
            déployé il y a <span className="num">{relativeTime(current.deployedAt, now)}</span> par {current.actor}
          </p>
          <a className="link delivery-env__workflow" href={current.workflowUrl} target="_blank" rel="noreferrer">
            Voir le workflow
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      )}
      <div className="delivery-env__history">
        <h4 className="small-caps delivery-env__history-title">Historique</h4>
        <ul className="delivery-env__history-list">
          {environment.history.slice(0, HISTORY_LIMIT).map((deployment) => (
            <li key={deployment.id} className="delivery-env__history-item">
              <StatusMark mark={deploymentMark(deployment.outcome)} size={14} label={DEPLOYMENT_OUTCOME_LABELS[deployment.outcome]} />
              <span className="mono truncate">{deployment.version}</span>
              <span className="delivery-env__history-time num">{relativeTime(deployment.deployedAt, now)}</span>
            </li>
          ))}
        </ul>
      </div>
      <footer className="delivery-env__footer">
        <RedeployControl environment={environment} onRedeploy={onRedeploy} />
      </footer>
    </Card>
  );
}
