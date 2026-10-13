import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Card, Stat } from '../../ui/components/Card.tsx';
import { ReadStamp } from '../../widgets/ReadStamp.tsx';
import type { ChangesSummary as Summary, DeploymentsRead } from './changes-model.ts';

interface ChangesSummaryProps {
  readonly summary: Summary;
  /** What waits for the operator, whatever the period. */
  readonly awaiting: number;
}

/** When the deployments a count comes from were read; nothing when no environment declares a source to read them from. */
function DeploymentsReadStamp({ read }: { readonly read: DeploymentsRead }) {
  return read.kind === 'none' ? null : <ReadStamp readAt={read.readAt} kind="forge" />;
}

export function ChangesSummary({ summary, awaiting }: ChangesSummaryProps) {
  const { t } = useI18n();
  const read = <DeploymentsReadStamp read={summary.deploymentsRead} />;
  return (
    <Card className="changes-summary" role="group" aria-label={t('changes.summary.label')}>
      <Stat label={t('changes.summary.merged')} value={summary.mergedPullRequests} />
      <Stat label={t('changes.summary.awaiting')} value={awaiting} />
      <Stat label={t('changes.summary.deployments')} value={summary.deployments} hint={read} />
      <Stat label={t('changes.summary.failed')} value={summary.failedDeployments} hint={read} />
    </Card>
  );
}
