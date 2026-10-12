import './pull-request-evidence.css';
import './pull-request-scores.css';
import type { ReactNode } from 'react';
import { useId } from 'react';
import type { Evidence } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { CodeBlock } from '../../ui/components/CodeBlock.tsx';
import { AcceptanceTestsEvidence } from './AcceptanceTestsEvidence.tsx';
import { EvalScoresEvidence } from './EvalScoresEvidence.tsx';
import { isMediaEvidence } from './evidence-model.ts';
import { ImageCompareEvidence, RecordingEvidence } from './MediaEvidence.tsx';
import { RedGreenEvidence } from './RedGreenEvidence.tsx';

interface EvidenceFrameProps {
  readonly title: string;
  readonly kind: Evidence['kind'];
  readonly caption?: string | undefined;
  readonly children: ReactNode;
}

function EvidenceFrame({ title, kind, caption, children }: EvidenceFrameProps) {
  const vocabulary = useVocabulary();
  const titleId = useId();
  return (
    <figure className="evidence" aria-labelledby={titleId}>
      <figcaption className="evidence__header">
        <span id={titleId} className="evidence__title">
          {title}
        </span>
        <span className="evidence__kind small-caps">{vocabulary.evidenceKind(kind)}</span>
      </figcaption>
      {children}
      {caption === undefined || caption.length === 0 ? null : <p className="evidence__caption">{caption}</p>}
    </figure>
  );
}

function EvidenceBody({ evidence }: { readonly evidence: Evidence }) {
  switch (evidence.kind) {
    case 'image-compare':
      return <ImageCompareEvidence evidence={evidence} />;
    case 'recording':
      return <RecordingEvidence evidence={evidence} />;
    case 'red-green':
      return <RedGreenEvidence evidence={evidence} />;
    case 'acceptance-tests':
      return <AcceptanceTestsEvidence evidence={evidence} />;
    case 'eval-scores':
      return <EvalScoresEvidence evidence={evidence} />;
    case 'report':
      return <CodeBlock code={evidence.body} wrap title="report.md" />;
  }
}

/** One piece of evidence, framed with its title and its kind. */
export function EvidenceItem({ evidence }: { readonly evidence: Evidence }) {
  const caption = evidence.kind === 'image-compare' || evidence.kind === 'recording' ? evidence.caption : undefined;
  return (
    <EvidenceFrame title={evidence.title} kind={evidence.kind} caption={caption}>
      <EvidenceBody evidence={evidence} />
    </EvidenceFrame>
  );
}

const evidenceKey = (evidence: Evidence): string => `${evidence.kind}:${evidence.id}`;

/** The evidence of a pull request: the images and recordings side by side first, then the rest in the order the factory produced it. */
export function EvidenceGallery({ evidence }: { readonly evidence: readonly Evidence[] }) {
  const { t } = useI18n();
  const media = evidence.filter(isMediaEvidence);
  const others = evidence.filter((entry) => !isMediaEvidence(entry));
  return (
    <div className="evidence-gallery" role="group" aria-label={t('pullRequests.evidence.list')}>
      {media.length === 0 ? null : (
        <div className={`evidence-gallery__media${media.length > 1 ? ' is-pair' : ''}`}>
          {media.map((entry) => (
            <EvidenceItem key={evidenceKey(entry)} evidence={entry} />
          ))}
        </div>
      )}
      {others.map((entry) => (
        <EvidenceItem key={evidenceKey(entry)} evidence={entry} />
      ))}
    </div>
  );
}
