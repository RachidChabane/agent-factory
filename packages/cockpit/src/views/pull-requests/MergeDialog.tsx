import { useProject } from '../../app/ProjectRoute.tsx';
import type { PullRequestView } from '../../contract/index.ts';
import type { Translate } from '../../i18n/create-i18n.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { shortSha } from '../../model/identifiers.ts';
import { PropertyList } from '../../ui/components/Card.tsx';
import { CommandDialog } from '../../widgets/CommandDialog.tsx';
import type { ChecksDigest } from './pull-request-model.ts';
import { digestChecks } from './pull-request-model.ts';

const CHECKS_SEPARATOR = ' · ';

function describeChecks(checks: ChecksDigest, t: Translate): string {
  if (checks.kind === 'unread') return t('pullRequests.merge.checksUnread');
  if (checks.kind === 'none') return t('pullRequests.checksNone');
  const summary = t('pullRequests.checksSummary', { passed: checks.passed, count: checks.total });
  return checks.failingOnBase === 0 ? summary : [summary, t('pullRequests.merge.checksFailingOnBase', { count: checks.failingOnBase })].join(CHECKS_SEPARATOR);
}

interface MergeDialogProps {
  readonly pullRequest: PullRequestView;
  readonly onClose: () => void;
}

/** What the operator is about to merge, and the head the factory will refuse to merge past. */
export function MergeDialog({ pullRequest, onClose }: MergeDialogProps) {
  const { t } = useI18n();
  const project = useProject();
  const checksText = describeChecks(digestChecks(pullRequest.checks), t);
  return (
    <CommandDialog
      open
      onClose={onClose}
      command="pr.merge"
      body={{ project: project.id, number: pullRequest.number, expectedHeadSha: pullRequest.headSha }}
      title={t('pullRequests.merge.title', { number: pullRequest.number })}
      description={t('pullRequests.merge.description', { branch: project.baseBranch })}
      confirmLabel={t('pullRequests.merge.confirm', { number: pullRequest.number })}
    >
      <PropertyList
        items={[
          { label: t('pullRequests.merge.pullRequest'), value: pullRequest.title },
          { label: t('pullRequests.merge.branch'), value: <span className="mono">{pullRequest.branch}</span> },
          {
            label: t('pullRequests.merge.head'),
            value: (
              <span className="mono" title={pullRequest.headSha}>
                {shortSha(pullRequest.headSha)}
              </span>
            ),
          },
          { label: t('pullRequests.merge.checks'), value: checksText },
          { label: t('pullRequests.merge.evidence'), value: pullRequest.evidenceComplete ? t('pullRequests.evidence.complete') : t('pullRequests.evidence.incomplete') },
        ]}
      />
    </CommandDialog>
  );
}
