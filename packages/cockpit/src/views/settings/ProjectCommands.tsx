import { useId } from 'react';
import type { ProjectSettingsView } from '../../contract/index.ts';
import { MINUTE_MS } from '../../i18n/formatters.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { NamedCommandList } from './NamedCommandList.tsx';

/** The commands that prepare a worktree before the checks run. */
export function SetupCommands({ commands }: { readonly commands: ProjectSettingsView['setup'] }) {
  const { t } = useI18n();
  return (
    <Card>
      <NamedCommandList label={t('settings.setup.title')} commands={commands} empty={t('settings.setup.empty')} />
    </Card>
  );
}

function GateGroup({ title, commands, empty }: { readonly title: string; readonly commands: ProjectSettingsView['setup']; readonly empty: string }) {
  const headingId = useId();
  return (
    <div className="gate-group" role="group" aria-labelledby={headingId}>
      <h3 id={headingId} className="small-caps">
        {title}
      </h3>
      <NamedCommandList label={title} commands={commands} empty={empty} />
    </div>
  );
}

/** The commands the gate runs before and after the acceptance checks, and how long the gate may take. */
export function GateCommands({ gate }: { readonly gate: ProjectSettingsView['gate'] }) {
  const { t, fmt } = useI18n();
  return (
    <Card className="gate">
      <GateGroup title={t('settings.gate.before')} commands={gate.beforeAcceptance} empty={t('settings.gate.beforeEmpty')} />
      <GateGroup title={t('settings.gate.after')} commands={gate.afterAcceptance} empty={t('settings.gate.afterEmpty')} />
      <p className="gate__timeout">{t('settings.gate.timeout', { duration: fmt.duration(gate.timeoutMinutes * MINUTE_MS) })}</p>
    </Card>
  );
}
