import { CircleCheck } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import type { ReviewRound } from '../../contract/index.ts';
import { relativeTime } from '../../format/format.ts';
import { REVIEW_CATEGORY_LABELS, REVIEW_SEVERITY_LABELS } from '../../i18n/labels.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';

export function ReviewRounds({ rounds }: { readonly rounds: readonly ReviewRound[] }) {
  const now = useNow();
  if (rounds.length === 0) return <EmptyState compact title="Pas encore de revue" description="Le relecteur passe après le gate, dans un contexte neuf." />;
  return (
    <ol className="review-rounds">
      {rounds.toReversed().map((round) => (
        <li key={round.round} className="review-round">
          <header className="review-round__header">
            <span className="review-round__title">Passe {round.round}</span>
            <span className="review-round__meta">
              <span className="mono">{round.runId}</span> · il y a {relativeTime(round.completedAt, now)}
            </span>
            {round.findings.length === 0 ? (
              <Badge tone="success" icon={<CircleCheck />}>
                Aucun constat
              </Badge>
            ) : (
              <Badge tone={round.findings.some((finding) => finding.severity === 'blocking' && !finding.resolved) ? 'failed' : 'neutral'}>
                {round.findings.length} constat{round.findings.length > 1 ? 's' : ''}
              </Badge>
            )}
          </header>
          {round.findings.length === 0 ? null : (
            <ul className="review-findings">
              {round.findings.map((finding, index) => (
                <li key={index} className={`review-finding${finding.resolved ? ' is-resolved' : ''}`}>
                  <div className="review-finding__tags">
                    <Badge tone={finding.severity === 'blocking' ? 'failed' : 'neutral'}>{REVIEW_SEVERITY_LABELS[finding.severity]}</Badge>
                    <span className="review-finding__category">{REVIEW_CATEGORY_LABELS[finding.category]}</span>
                    {finding.resolved ? <Badge tone="success">Résolu</Badge> : null}
                  </div>
                  <p className="review-finding__summary">{finding.summary}</p>
                  {finding.file === null ? null : (
                    <p className="review-finding__location mono">
                      {finding.file}
                      {finding.line === null ? '' : `:${finding.line}`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
