import { useId } from 'react';
import type { EnvironmentView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { environmentMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DeploymentsPanel } from './DeploymentsPanel.tsx';
import { EnvironmentActions } from './EnvironmentActions.tsx';
import { HealthPanel } from './HealthPanel.tsx';

/** One environment of the project: where it stands, what is deployed on it, how healthy it is, and what can be done to it. */
export function EnvironmentCard({ environment }: { readonly environment: EnvironmentView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const headingId = useId();
  const status = vocabulary.environmentStatus(environment.status);
  return (
    <Card padded={false} className="env-card" role="article" aria-labelledby={headingId}>
      <header className="env-card__header">
        <StatusMark mark={environmentMark(environment.status)} label={status} />
        <h3 id={headingId} className="env-card__name">
          {environment.name}
        </h3>
        <span className="env-card__status">{status}</span>
        <div className="env-card__badges">
          {environment.production ? <Badge tone="accent">{t('delivery.env.production')}</Badge> : null}
          <Badge>{t('delivery.env.promotion', { policy: vocabulary.promotionPolicy(environment.promotion) })}</Badge>
        </div>
      </header>
      <div className="env-card__body">
        <DeploymentsPanel environment={environment} />
        <HealthPanel environment={environment} />
      </div>
      <EnvironmentActions environment={environment} />
    </Card>
  );
}
