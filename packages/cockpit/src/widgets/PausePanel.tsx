import { Pause, Play } from 'lucide-react';
import type { PauseView } from '../contract/index.ts';
import type { Translate } from '../i18n/create-i18n.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { isDraining } from '../model/actions.ts';
import { useVocabulary } from '../i18n/vocabulary.ts';
import { Badge } from '../ui/components/Badge.tsx';
import { Card } from '../ui/components/Card.tsx';
import { CommandButton } from './CommandButton.tsx';
import { DrainControl } from './DrainControl.tsx';
import { Time } from './Time.tsx';

export interface PauseScopeView {
  /** The project the pauses belong to; null for the whole installation. */
  readonly project: string | null;
  readonly pauses: readonly PauseView[];
}

function PauseRow({ pause }: { readonly pause: PauseView }) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <li className="pause-row">
      <Badge tone={pause.cause === 'operator' ? 'waiting' : 'running'}>{vocabulary.pauseCause(pause.cause)}</Badge>
      <div className="pause-row__body">
        <p className="pause-row__reason">{pause.reason}</p>
        <p className="pause-row__meta">
          <span>{rich(pause.cause === 'drain' ? 'pause.drainAsked' : 'pause.since', { age: <Time iso={pause.since} /> })}</span>
          <span>{pause.resumesAt === null ? t(`pause.stays.${pause.cause}`) : rich('pause.resumesAt', { when: <Time iso={pause.resumesAt} mode="until" /> })}</span>
        </p>
      </div>
    </li>
  );
}

function scopeState(pauses: readonly PauseView[], t: Translate): string {
  if (pauses.length === 0) return t('pause.runningState');
  return isDraining(pauses) ? t('pause.drainingState') : t('pause.pausedState');
}

function ScopeSection({ scope, heading }: { readonly scope: PauseScopeView; readonly heading: string }) {
  const { t } = useI18n();
  const operatorPause = scope.pauses.some((pause) => pause.cause === 'operator');
  const installation = scope.project === null;
  return (
    <section className="pause-scope" aria-label={heading}>
      <header className="pause-scope__header">
        <h3 className="pause-scope__title">{heading}</h3>
        <Badge tone={scope.pauses.length === 0 ? 'success' : 'waiting'}>{scopeState(scope.pauses, t)}</Badge>
        {operatorPause ? (
          <CommandButton command="scheduler.resume" body={{ project: scope.project }} size="sm" variant="primary" icon={<Play size={13} />}>
            {installation ? t('pause.resumeInstallation') : t('pause.resumeProject')}
          </CommandButton>
        ) : (
          <CommandButton command="scheduler.pause" body={{ project: scope.project }} size="sm" icon={<Pause size={13} />}>
            {installation ? t('pause.pauseInstallation') : t('pause.pauseProject')}
          </CommandButton>
        )}
        {installation ? <DrainControl appearance="button" /> : null}
      </header>
      {scope.pauses.length === 0 ? null : (
        <ul className="pause-scope__list">
          {scope.pauses.map((pause) => (
            <PauseRow key={`${pause.scope}-${pause.cause}`} pause={pause} />
          ))}
        </ul>
      )}
    </section>
  );
}

interface PausePanelProps {
  readonly scopes: readonly PauseScopeView[];
}

/** What stops the factory from starting work, per scope, with the button that pauses or resumes that scope. */
export function PausePanel({ scopes }: PausePanelProps) {
  const { t } = useI18n();
  return (
    <Card className="pause-panel" aria-label={t('pause.heading')}>
      {scopes.map((scope) => (
        <ScopeSection key={scope.project ?? 'installation'} scope={scope} heading={scope.project === null ? t('pause.installationHeading') : t('pause.projectHeading')} />
      ))}
    </Card>
  );
}
