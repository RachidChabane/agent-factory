import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Card, Stat } from '../../ui/components/Card.tsx';
import type { ChangesSummary as Summary } from './changes-model.ts';

interface ChangesSummaryProps {
  readonly summary: Summary;
  /** What waits for the operator, whatever the period. */
  readonly awaiting: number;
}

export function ChangesSummary({ summary, awaiting }: ChangesSummaryProps) {
  const { t } = useI18n();
  return (
    <Card className="changes-summary" role="group" aria-label={t('changes.summary.label')}>
      <Stat label={t('changes.summary.merged')} value={summary.mergedPullRequests} />
      <Stat label={t('changes.summary.awaiting')} value={awaiting} />
      <Stat label={t('changes.summary.deployments')} value={summary.deployments} />
      <Stat label={t('changes.summary.failed')} value={summary.failedDeployments} />
    </Card>
  );
}
