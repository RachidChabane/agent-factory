import { useState } from 'react';
import { Info } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { CommandBody, Deployment, EnvironmentView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Field, TextInput } from '../../ui/components/Field.tsx';
import { CommandDialog } from '../../widgets/CommandDialog.tsx';
import { ReadStamp } from '../../widgets/ReadStamp.tsx';
import { confirmsDeployedVersion, isDeploymentInProgress } from './redeploy-model.ts';

const ICON_SIZE = 16;

interface RedeployDialogProps {
  readonly environment: EnvironmentView;
  /** The deployment a redeploy repeats. */
  readonly deployed: Deployment;
  readonly onClose: () => void;
}

/** Asks the operator to type the version that is deployed before the workflow of an environment runs again. */
export function RedeployDialog({ environment, deployed, onClose }: RedeployDialogProps) {
  const { t } = useI18n();
  const project = useProject();
  const [typed, setTyped] = useState('');
  const confirmed = confirmsDeployedVersion(typed, deployed);
  const body: CommandBody<'deployment.redeploy'> | null = confirmed ? { project: project.id, environment: environment.name, confirmVersion: typed.trim() } : null;
  const mismatch = typed.trim() !== '' && !confirmed;
  const reading = environment.deployments;
  return (
    <CommandDialog
      open
      onClose={onClose}
      command="deployment.redeploy"
      body={body}
      canConfirm={confirmed}
      title={t('delivery.redeploy.title', { environment: environment.name })}
      description={t('delivery.redeploy.description', { environment: environment.name, version: deployed.version })}
      confirmLabel={t('delivery.redeploy.confirm', { version: deployed.version })}
      tone="danger"
    >
      {reading === null ? null : <ReadStamp readAt={reading.readAt} error={reading.error} kind="forge" />}
      {isDeploymentInProgress(environment) ? (
        <div className="callout callout--running" role="note">
          <Info size={ICON_SIZE} aria-hidden="true" />
          <div className="callout__body">
            <p>{t('delivery.redeploy.inProgress', { environment: environment.name })}</p>
          </div>
        </div>
      ) : null}
      <Field
        label={t('delivery.redeploy.field')}
        hint={t('delivery.redeploy.hint', { version: deployed.version })}
        error={mismatch ? t('delivery.redeploy.mismatch', { environment: environment.name }) : null}
      >
        {(id, describedBy) => (
          <TextInput
            id={id}
            className="mono"
            aria-describedby={describedBy}
            aria-invalid={mismatch || undefined}
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.currentTarget.value)}
          />
        )}
      </Field>
    </CommandDialog>
  );
}
