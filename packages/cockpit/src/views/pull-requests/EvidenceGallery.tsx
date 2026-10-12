import type { ReactNode } from 'react';
import { useState } from 'react';
import { CircleCheck, CircleX, Pause, Play } from 'lucide-react';
import { evaluateSkillEval } from '@agent-factory/domain';
import type { CheckRunLog, Evidence, RunOutcomeSummary } from '../../contract/index.ts';
import { duration, oneDecimal, plural, shortSha } from '../../format/format.ts';
import { baseTestMark, branchTestMark, type StatusMark as StatusMarkKind } from '../../model/status.ts';
import { BASE_TEST_RESULT_LABELS, BRANCH_TEST_RESULT_LABELS } from '../../i18n/labels.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { CodeBlock } from '../../ui/components/CodeBlock.tsx';
import { ImageCompare } from '../../ui/components/ImageCompare.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';

const SCORE_DIGITS = 2;

type EvidenceOf<K extends Evidence['kind']> = Extract<Evidence, { kind: K }>;

function score(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: SCORE_DIGITS, maximumFractionDigits: SCORE_DIGITS });
}

function signedScore(value: number): string {
  return `${value >= 0 ? '+' : '−'}${score(Math.abs(value))}`;
}

function EvidenceFrame({ title, caption, kindLabel, children }: { readonly title: string; readonly caption?: string | undefined; readonly kindLabel: string; readonly children: ReactNode }) {
  return (
    <figure className="evidence">
      <figcaption className="evidence__header">
        <span className="evidence__title">{title}</span>
        <span className="evidence__kind small-caps">{kindLabel}</span>
      </figcaption>
      {children}
      {caption === undefined || caption.length === 0 ? null : <p className="evidence__caption">{caption}</p>}
    </figure>
  );
}

function RecordingPlayer({ evidence }: { readonly evidence: EvidenceOf<'recording'> }) {
  const [playing, setPlaying] = useState(false);
  const source = playing || evidence.posterUrl === null ? evidence.url : evidence.posterUrl;
  return (
    <div className="recording">
      <img className="recording__media" src={source} alt={evidence.title} />
      <button type="button" className={`recording__toggle${playing ? ' is-playing' : ''}`} onClick={() => setPlaying((value) => !value)} aria-pressed={playing}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
        <span>{playing ? 'Pause' : `Lire l’animation · ${duration(evidence.durationMs)}`}</span>
      </button>
    </div>
  );
}

const RUN_LOG_MAX_HEIGHT = 260;
const NO_TEST_RUN_LABEL = 'Aucun test exécuté';

function runHeadline(summary: RunOutcomeSummary): string {
  const parts = [
    summary.failed > 0 ? plural(summary.failed, 'test en échec', 'tests en échec') : null,
    summary.passed > 0 ? plural(summary.passed, 'test réussi', 'tests réussis') : null,
    summary.skipped > 0 ? plural(summary.skipped, 'test ignoré', 'tests ignorés') : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? NO_TEST_RUN_LABEL : parts.join(' · ');
}

function RunSummary({ summary }: { readonly summary: RunOutcomeSummary }) {
  return (
    <div className="red-green__summary">
      <p className="red-green__headline">{runHeadline(summary)}</p>
      {summary.failures.length === 0 ? null : (
        <ul className="red-green__failures" aria-label="Tests en échec">
          {summary.failures.map((failure, position) => (
            <li key={`${position}-${failure.test}`} className="red-green__failure">
              <span className="red-green__failure-test mono">{failure.test}</span>
              {failure.message === null ? null : <span className="red-green__failure-message mono">{failure.message}</span>}
            </li>
          ))}
        </ul>
      )}
      {summary.missing.length === 0 ? null : (
        <ul className="red-green__failures" aria-label="Tests absents">
          {summary.missing.map((test) => (
            <li key={test} className="red-green__failure">
              <span className="red-green__failure-test mono">{test}</span>
              <span className="red-green__failure-message">Absent de la branche</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RunPanel({ run, title }: { readonly run: CheckRunLog; readonly title: ReactNode }) {
  const succeeded = run.outcome === 'passed';
  return (
    <figure className={`ds-code ds-code--${succeeded ? 'success' : 'failed'} red-green__panel`}>
      <figcaption className="ds-code__header">
        <span className="ds-code__title">
          {succeeded ? <CircleCheck size={14} className="red-green__pass" /> : <CircleX size={14} className="red-green__fail" />}
          {title}
        </span>
      </figcaption>
      {run.summary === null ? null : <RunSummary summary={run.summary} />}
      <details className="red-green__log">
        <summary>Journal complet</summary>
        <CodeBlock code={run.log} maxHeight={RUN_LOG_MAX_HEIGHT} wrap />
      </details>
    </figure>
  );
}

function RedGreen({ evidence }: { readonly evidence: EvidenceOf<'red-green'> }) {
  return (
    <div className="red-green">
      <p className="red-green__command mono">$ {evidence.command}</p>
      <div className="red-green__pair">
        <RunPanel
          run={evidence.before}
          title={
            <>
              Avant · base <span className="mono">{shortSha(evidence.before.sha)}</span>
            </>
          }
        />
        <RunPanel
          run={evidence.after}
          title={
            <>
              Après · branche <span className="mono">{shortSha(evidence.after.sha)}</span>
            </>
          }
        />
      </div>
    </div>
  );
}

function OutcomeCell({ mark, label }: { readonly mark: StatusMarkKind; readonly label: string }) {
  return (
    <span className="acceptance-tests__outcome">
      <StatusMark mark={mark} size={13} label={label} />
      <span>{label}</span>
    </span>
  );
}

function criterionGroups(evidence: EvidenceOf<'acceptance-tests'>): readonly { readonly criterion: number; readonly rows: EvidenceOf<'acceptance-tests'>['rows'] }[] {
  const criteria = [...new Set(evidence.rows.map((row) => row.criterion))].sort((left, right) => left - right);
  return criteria.map((criterion) => ({ criterion, rows: evidence.rows.filter((row) => row.criterion === criterion) }));
}

function AcceptanceTests({ evidence }: { readonly evidence: EvidenceOf<'acceptance-tests'> }) {
  const textOf = (criterion: number): string | undefined => evidence.criteria.find((entry) => entry.criterion === criterion)?.text;
  return (
    <div className="acceptance-tests">
      <table className="acceptance-tests__table" aria-label="Tests d’acceptation">
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col">Base</th>
            <th scope="col">Branche</th>
          </tr>
        </thead>
        {criterionGroups(evidence).map((group) => (
          <tbody key={group.criterion}>
            <tr className="acceptance-tests__criterion">
              <th scope="colgroup" colSpan={3}>
                <span className="num">Critère {group.criterion}</span>
                {textOf(group.criterion) === undefined ? null : <span className="acceptance-tests__criterion-text">{textOf(group.criterion)}</span>}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.test}>
                <td className="acceptance-tests__test mono" title={row.test}>
                  {row.name}
                </td>
                <td>
                  <OutcomeCell mark={baseTestMark(row.base)} label={BASE_TEST_RESULT_LABELS[row.base]} />
                </td>
                <td>
                  <OutcomeCell mark={branchTestMark(row.branch)} label={BRANCH_TEST_RESULT_LABELS[row.branch]} />
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {evidence.runner === null ? null : <p className="evidence__caption">Exécutés avec {evidence.runner}.</p>}
    </div>
  );
}

function EvalScores({ evidence }: { readonly evidence: EvidenceOf<'eval-scores'> }) {
  const verdict = evaluateSkillEval(
    evidence.cases.map((entry) => ({ caseId: entry.caseId, targeted: entry.targeted, baseScores: [entry.baseScore], branchScores: [entry.branchScore] })),
    { minimumTargetedDelta: evidence.minimumDelta, regressionTolerance: evidence.regressionTolerance },
  );
  const cases = evidence.cases.toSorted((left, right) => Number(right.targeted) - Number(left.targeted));
  return (
    <div className="eval">
      <div className={`eval__verdict${verdict.passed ? ' is-passed' : ' is-failed'}`}>
        {verdict.passed ? <CircleCheck size={15} /> : <CircleX size={15} />}
        <span>
          Gate d’évaluation {verdict.passed ? 'réussi' : 'en échec'} : {verdict.targetedDelta === null ? 'aucun cas ciblé' : `${signedScore(verdict.targetedDelta)} sur les cas ciblés`} (minimum{' '}
          {signedScore(evidence.minimumDelta)}), {verdict.regressions.length === 0 ? 'aucune régression' : plural(verdict.regressions.length, 'régression', 'régressions')} au-delà de {score(evidence.regressionTolerance)} ·{' '}
          {evidence.runsPerCase} rejeux par cas
        </span>
      </div>
      <div className="eval__legend" aria-hidden="true">
        <span className="eval__swatch eval__swatch--base" /> Base
        <span className="eval__swatch eval__swatch--branch" /> Branche
      </div>
      <ul className="eval__cases" aria-label="Scores par cas">
        {cases.map((entry) => {
          const delta = entry.branchScore - entry.baseScore;
          const regression = !entry.targeted && delta < -evidence.regressionTolerance;
          return (
            <li key={entry.caseId} className="eval-case">
              <div className="eval-case__label">
                <span className="truncate">{entry.label}</span>
                {entry.targeted ? <Badge tone="accent">ciblé</Badge> : null}
              </div>
              <div className="eval-case__bars" aria-label={`${entry.label} : base ${score(entry.baseScore)}, branche ${score(entry.branchScore)}`}>
                <span className="eval-case__track">
                  <span className="eval-case__bar eval-case__bar--base" style={{ width: `${entry.baseScore * 100}%` }} />
                </span>
                <span className="eval-case__value num">{score(entry.baseScore)}</span>
                <span className="eval-case__track">
                  <span className="eval-case__bar eval-case__bar--branch" style={{ width: `${entry.branchScore * 100}%` }} />
                </span>
                <span className="eval-case__value num">{score(entry.branchScore)}</span>
              </div>
              <span className={`eval-case__delta num${delta > 0 ? ' is-up' : ''}${regression ? ' is-regression' : ''}`}>{signedScore(delta)}</span>
            </li>
          );
        })}
      </ul>
      <p className="eval__footnote">
        Moyenne ciblée {verdict.targetedDelta === null ? '—' : signedScore(verdict.targetedDelta)} · tolérance de régression {oneDecimal(evidence.regressionTolerance * 100)} points
      </p>
    </div>
  );
}

const KIND_LABELS: Readonly<Record<Evidence['kind'], string>> = {
  'image-compare': 'Avant / après',
  recording: 'Animation',
  'red-green': 'Rouge → vert',
  'acceptance-tests': 'Tests d’acceptation',
  'eval-scores': 'Évaluation',
  report: 'Rapport',
};

export function EvidenceItem({ evidence }: { readonly evidence: Evidence }) {
  switch (evidence.kind) {
    case 'image-compare':
      return (
        <EvidenceFrame title={evidence.title} caption={evidence.caption} kindLabel={KIND_LABELS[evidence.kind]}>
          <ImageCompare beforeUrl={evidence.beforeUrl} afterUrl={evidence.afterUrl} width={evidence.width} height={evidence.height} alt={evidence.title} />
        </EvidenceFrame>
      );
    case 'recording':
      return (
        <EvidenceFrame title={evidence.title} caption={evidence.caption} kindLabel={KIND_LABELS[evidence.kind]}>
          <RecordingPlayer evidence={evidence} />
        </EvidenceFrame>
      );
    case 'red-green':
      return (
        <EvidenceFrame title={evidence.title} kindLabel={KIND_LABELS[evidence.kind]}>
          <RedGreen evidence={evidence} />
        </EvidenceFrame>
      );
    case 'acceptance-tests':
      return (
        <EvidenceFrame title={evidence.title} kindLabel={KIND_LABELS[evidence.kind]}>
          <AcceptanceTests evidence={evidence} />
        </EvidenceFrame>
      );
    case 'eval-scores':
      return (
        <EvidenceFrame title={evidence.title} kindLabel={KIND_LABELS[evidence.kind]}>
          <EvalScores evidence={evidence} />
        </EvidenceFrame>
      );
    case 'report':
      return (
        <EvidenceFrame title={evidence.title} kindLabel={KIND_LABELS[evidence.kind]}>
          <CodeBlock code={evidence.body} wrap />
        </EvidenceFrame>
      );
  }
}

export function EvidenceGallery({ evidence }: { readonly evidence: readonly Evidence[] }) {
  const media = evidence.filter((entry) => entry.kind === 'image-compare' || entry.kind === 'recording');
  const others = evidence.filter((entry) => entry.kind !== 'image-compare' && entry.kind !== 'recording');
  return (
    <div className="evidence-gallery">
      {media.length === 0 ? null : (
        <div className={`evidence-gallery__media${media.length > 1 ? ' is-pair' : ''}`}>
          {media.map((entry) => (
            <EvidenceItem key={entry.id} evidence={entry} />
          ))}
        </div>
      )}
      {others.map((entry) => (
        <EvidenceItem key={entry.id} evidence={entry} />
      ))}
    </div>
  );
}
