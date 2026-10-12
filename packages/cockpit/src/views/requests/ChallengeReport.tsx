import { MessageCircleQuestionMark } from 'lucide-react';
import { CHALLENGE_VERDICTS } from '../../contract/index.ts';
import type { ChallengeItem, ChallengeReport as ChallengeReportModel, ChallengeVerdict } from '../../contract/index.ts';
import { CHALLENGE_VERDICT_LABELS } from '../../i18n/labels.ts';
import { Badge } from '../../ui/components/Badge.tsx';

const VERDICT_TONES: Readonly<Record<ChallengeVerdict, 'success' | 'accent' | 'running' | 'waiting' | 'failed'>> = {
  keep: 'success',
  adjust: 'accent',
  split: 'running',
  ask: 'waiting',
  decline: 'failed',
};

const FACETS = [
  { key: 'currentState', label: 'État actuel' },
  { key: 'intent', label: 'Intention' },
  { key: 'idea', label: 'Idée' },
  { key: 'method', label: 'Méthode' },
] as const satisfies readonly { readonly key: keyof ChallengeItem; readonly label: string }[];

export function VerdictSummary({ report }: { readonly report: ChallengeReportModel }) {
  return (
    <ul className="verdict-summary" aria-label="Répartition des verdicts">
      {CHALLENGE_VERDICTS.map((verdict) => {
        const count = report.items.filter((item) => item.verdict === verdict).length;
        if (count === 0) return null;
        return (
          <li key={verdict}>
            <Badge tone={VERDICT_TONES[verdict]}>
              <span className="num">{count}</span> {CHALLENGE_VERDICT_LABELS[verdict].toLocaleLowerCase('fr-FR')}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function ItemCard({ item, position }: { readonly item: ChallengeItem; readonly position: number }) {
  return (
    <li className={`challenge-item challenge-item--${item.verdict}`}>
      <header className="challenge-item__header">
        <span className="challenge-item__index num">{position}</span>
        <h4 className="challenge-item__title">{item.title}</h4>
        <Badge tone={VERDICT_TONES[item.verdict]}>{CHALLENGE_VERDICT_LABELS[item.verdict]}</Badge>
      </header>
      <p className="challenge-item__reason">{item.reason}</p>
      {item.question === null ? null : (
        <p className="challenge-item__question">
          <MessageCircleQuestionMark size={14} aria-hidden="true" />
          {item.question}
        </p>
      )}
      <dl className="challenge-item__facets">
        {FACETS.map((facet) => (
          <div key={facet.key} className="challenge-item__facet">
            <dt>{facet.label}</dt>
            <dd>{item[facet.key]}</dd>
          </div>
        ))}
      </dl>
      {item.sources.length === 0 ? null : (
        <ul className="challenge-item__sources" aria-label="Sources">
          {item.sources.map((source) => (
            <li key={`${source.label}-${source.reference}`} className="challenge-source" title={source.reference}>
              <span className="challenge-source__label">{source.label}</span>
              <span className="challenge-source__reference mono truncate">{source.reference}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function ChallengeItems({ report }: { readonly report: ChallengeReportModel }) {
  return (
    <ol className="challenge-items">
      {report.items.map((item, index) => (
        <ItemCard key={item.id} item={item} position={index + 1} />
      ))}
    </ol>
  );
}
