import { useId } from 'react';
import { useProject } from '../../app/ProjectRoute.tsx';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import type { PullRequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Badge } from '../../ui/components/Badge.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { ChangedFiles } from './ChangedFiles.tsx';
import { EvidenceGallery } from './EvidenceGallery.tsx';
import { ExternalFeedback } from './ExternalFeedback.tsx';
import { FilmSection } from './FilmSection.tsx';
import { MergeDialog } from './MergeDialog.tsx';
import { MergeBlockers } from './MergeBlockers.tsx';
import { PullRequestHeader } from './PullRequestHeader.tsx';
import { PullRequestChecks } from './PullRequestChecks.tsx';
import { hasFilmsToShow } from './film-model.ts';
import { mergeAvailability } from './pull-request-model.ts';
import { ReadyNotice } from './ReadyNotice.tsx';
import { ReviewRounds } from './ReviewRounds.tsx';
import { useMergeDialog } from './use-merge-dialog.ts';
import { DelegatedMarks } from '../../widgets/DelegatedMarks.tsx';

const ICON_SIZE = 16;
const BADGE_ICON_SIZE = 12;

function EvidenceSection({ pullRequest }: { readonly pullRequest: PullRequestView }) {
  const { t } = useI18n();
  return (
    <Section
      title={t('pullRequests.evidence.title')}
      id="pull-request-evidence"
      description={t('pullRequests.evidence.description')}
      actions={
        <Badge tone={pullRequest.evidenceComplete ? 'success' : 'failed'} icon={<ShieldCheck size={BADGE_ICON_SIZE} aria-hidden="true" />}>
          {pullRequest.evidenceComplete ? t('pullRequests.evidence.complete') : t('pullRequests.evidence.incomplete')}
        </Badge>
      }
    >
      {pullRequest.missingEvidence.length === 0 ? null : (
        <section className="callout callout--failed" aria-label={t('pullRequests.evidence.missing')}>
          <CircleAlert size={ICON_SIZE} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">{t('pullRequests.evidence.missing')}</p>
            <ul className="bullets">
              {pullRequest.missingEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
      {pullRequest.evidence.length === 0 ? <EmptyState compact title={t('pullRequests.evidence.none')} /> : <EvidenceGallery evidence={pullRequest.evidence} />}
    </Section>
  );
}

interface PullRequestDetailProps {
  readonly pullRequest: PullRequestView;
  /** Whether the address names this pull request, which is what lets it ask to open the merge confirmation. */
  readonly requested: boolean;
}

export function PullRequestDetail({ pullRequest, requested }: PullRequestDetailProps) {
  const availability = mergeAvailability(pullRequest);
  const blockersId = useId();
  const merge = useMergeDialog(requested && availability.kind === 'ready');
  const project = useProject();
  return (
    <article className="detail pr-detail">
      <PullRequestHeader pullRequest={pullRequest} availability={availability} blockersId={blockersId} onMerge={() => merge.setOpen(true)} />
      {availability.kind === 'blocked' ? <MergeBlockers id={blockersId} blockers={availability.blockers} /> : null}
      <DelegatedMarks decisions={pullRequest.delegated} />
      <EvidenceSection pullRequest={pullRequest} />
      {hasFilmsToShow(project, pullRequest) ? <FilmSection pullRequest={pullRequest} /> : null}
      <ReadyNotice pullRequest={pullRequest} />
      <div className="pr-detail__columns">
        <ReviewRounds rounds={pullRequest.reviewRounds} />
        <PullRequestChecks pullRequest={pullRequest} />
      </div>
      <ExternalFeedback pullRequest={pullRequest} />
      <ChangedFiles pullRequest={pullRequest} />
      {merge.open ? <MergeDialog pullRequest={pullRequest} onClose={() => merge.setOpen(false)} /> : null}
    </article>
  );
}
