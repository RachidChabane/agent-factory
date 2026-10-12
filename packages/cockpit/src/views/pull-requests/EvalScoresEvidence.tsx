import { useMemo } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Badge } from '../../ui/components/Badge.tsx';
import type { EvidenceOf } from './evidence-model.ts';
import { SCORE_FRACTION_DIGITS, scoreDirection, scoreWidthPercent, summarizeEval } from './evidence-model.ts';

const ICON_SIZE = 15;

function useScoreFormat() {
  const { t, fmt } = useI18n();
  return {
    score: (value: number): string => fmt.decimal(value, SCORE_FRACTION_DIGITS),
    signed: (delta: number): string => t(`pullRequests.eval.delta.${scoreDirection(delta)}`, { value: fmt.decimal(Math.abs(delta), SCORE_FRACTION_DIGITS) }),
  };
}

function ScoreBar({ score, kind }: { readonly score: number; readonly kind: 'base' | 'branch' }) {
  const { score: format } = useScoreFormat();
  return (
    <>
      <span className="eval-case__track">
        <span className={`eval-case__bar eval-case__bar--${kind}`} style={{ width: `${scoreWidthPercent(score)}%` }} />
      </span>
      <span className="eval-case__value num">{format(score)}</span>
    </>
  );
}

export function EvalScoresEvidence({ evidence }: { readonly evidence: EvidenceOf<'eval-scores'> }) {
  const { t } = useI18n();
  const { score, signed } = useScoreFormat();
  const summary = useMemo(() => summarizeEval(evidence), [evidence]);
  return (
    <div className="eval">
      <div className={`eval__verdict${summary.passed ? ' is-passed' : ' is-failed'}`}>
        {summary.passed ? <CircleCheck size={ICON_SIZE} aria-hidden="true" /> : <CircleX size={ICON_SIZE} aria-hidden="true" />}
        <div className="eval__verdict-body">
          <p className="eval__verdict-title">{summary.passed ? t('pullRequests.eval.passed') : t('pullRequests.eval.failed')}</p>
          <ul className="eval__facts">
            <li>{summary.targetedDelta === null ? t('pullRequests.eval.noTargeted') : t('pullRequests.eval.targeted', { delta: signed(summary.targetedDelta) })}</li>
            <li>{t('pullRequests.eval.regressions', { count: summary.regressions })}</li>
            <li>{evidence.runsPerCase > 0 ? t('pullRequests.eval.runs', { count: evidence.runsPerCase }) : t('pullRequests.eval.runsUnknown')}</li>
            <li>{t('pullRequests.eval.thresholds', { minimum: signed(evidence.minimumDelta), tolerance: score(evidence.regressionTolerance) })}</li>
          </ul>
        </div>
      </div>
      <div className="eval__legend" aria-hidden="true">
        <span className="eval__swatch eval__swatch--base" />
        <span>{t('pullRequests.eval.base')}</span>
        <span className="eval__swatch eval__swatch--branch" />
        <span>{t('pullRequests.eval.branch')}</span>
      </div>
      <ul className="eval__cases" aria-label={t('pullRequests.eval.cases')}>
        {summary.cases.map(({ entry, name, delta, regression }) => (
          <li key={entry.caseId} className="eval-case">
            <div className="eval-case__label">
              <span className="eval-case__name">{name}</span>
              {entry.targeted ? <Badge tone="accent">{t('pullRequests.eval.targetedBadge')}</Badge> : null}
              {regression ? <Badge tone="failed">{t('pullRequests.eval.regressionBadge')}</Badge> : null}
            </div>
            <div className="eval-case__bars" role="img" aria-label={t('pullRequests.eval.scores', { label: name, base: score(entry.baseScore), branch: score(entry.branchScore) })}>
              <ScoreBar score={entry.baseScore} kind="base" />
              <ScoreBar score={entry.branchScore} kind="branch" />
            </div>
            <span className={`eval-case__delta num${scoreDirection(delta) === 'up' ? ' is-up' : ''}${regression ? ' is-regression' : ''}`}>{signed(delta)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
