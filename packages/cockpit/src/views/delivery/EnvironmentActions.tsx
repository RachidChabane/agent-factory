import { useState } from 'react';
import { Activity, RotateCw } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { Deployment, EnvironmentView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { CommandButton } from '../../widgets/CommandButton.tsx';
import { ForgeLink } from './ForgeLink.tsx';
import { RedeployDialog } from './RedeployDialog.tsx';
import type { RedeployAvailability } from './redeploy-model.ts';
import { redeployAvailability } from './redeploy-model.ts';

const ICON_SIZE = 14;

const REASONS_WITHOUT_REDEPLOY = {
  production: 'delivery.redeploy.production',
  'not-declared': 'delivery.redeploy.notDeclared',
  'nothing-deployed': 'delivery.redeploy.nothingDeployed',
} as const satisfies Readonly<Record<Exclude<RedeployAvailability['kind'], 'available'>, string>>;

function RedeployControl({ environment, deployed }: { readonly environment: EnvironmentView; readonly deployed: Deployment }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button icon={<RotateCw size={ICON_SIZE} />} aria-label={t('delivery.redeploy.buttonLabel', { environment: environment.name })} onClick={() => setAsking(true)}>
        {t('delivery.redeploy.button')}
      </Button>
      {asking ? <RedeployDialog environment={environment} deployed={deployed} onClose={() => setAsking(false)} /> : null}
    </>
  );
}

/** What the operator can do to an environment: check its health, redeploy it, or open its workflow. */
export function EnvironmentActions({ environment }: { readonly environment: EnvironmentView }) {
  const { t } = useI18n();
  const project = useProject();
  const availability = redeployAvailability(environment);
  return (
    <footer className="env-actions">
      <div className="env-actions__buttons">
        {environment.health.length === 0 ? null : (
          <CommandButton
            command="health.check"
            body={{ project: project.id, environment: environment.name }}
            icon={<Activity size={ICON_SIZE} />}
            aria-label={t('delivery.health.checkLabel', { environment: environment.name })}
          >
            {t('delivery.health.check')}
          </CommandButton>
        )}
        {availability.kind === 'available' ? <RedeployControl environment={environment} deployed={availability.deployed} /> : null}
        {environment.workflowUrl === null ? null : (
          <ForgeLink href={environment.workflowUrl} label={t('delivery.env.workflowLabel', { environment: environment.name })}>
            {t('delivery.env.workflow')}
          </ForgeLink>
        )}
      </div>
      {availability.kind === 'available' ? null : <p className="env-actions__note">{t(REASONS_WITHOUT_REDEPLOY[availability.kind])}</p>}
    </footer>
  );
}
