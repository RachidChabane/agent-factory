import { BellOff, ExternalLink } from 'lucide-react';
import type { AlertView } from '../../contract/index.ts';
import { relativeTime } from '../../format/format.ts';
import { ALERT_SEVERITY_LABELS, ALERT_STATE_LABELS } from '../../i18n/labels.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { ALERT_TONES, sortAlerts } from './health-metrics.ts';

interface HealthAlertsProps {
  readonly alerts: readonly AlertView[];
  readonly now: number;
}

export function HealthAlerts({ alerts, now }: HealthAlertsProps) {
  if (alerts.length === 0) {
    return (
      <Card>
        <EmptyState compact icon={<BellOff size={16} />} title="Aucune alerte" description="Aucun moniteur n’a été déclenché dans cet environnement." />
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <ul className="health-alerts" aria-label="Alertes">
        {sortAlerts(alerts).map((alert) => (
          <li key={alert.id} className={`health-alert${alert.status === 'resolved' ? ' is-resolved' : ''}`}>
            <Badge tone={ALERT_TONES[alert.severity]}>{ALERT_SEVERITY_LABELS[alert.severity]}</Badge>
            <div className="health-alert__body">
              <span className="health-alert__title">{alert.title}</span>
              <span className="health-alert__meta">
                {ALERT_STATE_LABELS[alert.status]} · <span className="num">{relativeTime(alert.triggeredAt, now)}</span>
              </span>
            </div>
            <a className="health-alert__link" href={alert.url} target="_blank" rel="noreferrer">
              Voir le moniteur
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
