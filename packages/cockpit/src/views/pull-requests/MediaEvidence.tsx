import { useI18n } from '../../i18n/I18nProvider.tsx';
import { ImageCompare } from '../../ui/components/ImageCompare.tsx';
import type { EvidenceOf } from './evidence-model.ts';
import { measuredSize } from './evidence-model.ts';

function SideBySide({ evidence }: { readonly evidence: EvidenceOf<'image-compare'> }) {
  const { t } = useI18n();
  const sides = [
    { id: 'before', label: t('compare.before'), url: evidence.beforeUrl },
    { id: 'after', label: t('compare.after'), url: evidence.afterUrl },
  ] as const;
  return (
    <div className="before-after">
      {sides.map((side) => (
        <div key={side.id} className="before-after__side">
          <img className="before-after__image" src={side.url} alt={`${evidence.title} — ${side.label}`} />
          <span className="before-after__tag">{side.label}</span>
        </div>
      ))}
    </div>
  );
}

/** A slider over the two screenshots; when the size of the images is unknown, the two side by side instead. */
export function ImageCompareEvidence({ evidence }: { readonly evidence: EvidenceOf<'image-compare'> }) {
  const { t } = useI18n();
  const size = measuredSize(evidence);
  if (size === null) {
    return (
      <>
        <SideBySide evidence={evidence} />
        <p className="evidence__note">{t('pullRequests.evidence.imageSizeUnknown')}</p>
      </>
    );
  }
  return (
    <>
      <ImageCompare beforeUrl={evidence.beforeUrl} afterUrl={evidence.afterUrl} width={size.width} height={size.height} alt={evidence.title} />
      <p className="evidence__note num">{t('pullRequests.evidence.imageSize', { width: size.width, height: size.height })}</p>
    </>
  );
}

export function RecordingEvidence({ evidence }: { readonly evidence: EvidenceOf<'recording'> }) {
  const { t, fmt } = useI18n();
  return (
    <div className="recording">
      <video className="recording__media" controls preload="none" playsInline poster={evidence.posterUrl ?? undefined} src={evidence.url} aria-label={evidence.title} />
      <p className="evidence__note recording__meta">
        {evidence.durationMs > 0 ? <span className="num">{t('pullRequests.evidence.recordingDuration', { duration: fmt.duration(evidence.durationMs) })}</span> : null}
        {evidence.posterUrl === null ? <span>{t('pullRequests.evidence.recordingNoPoster')}</span> : null}
        <a className="link" href={evidence.url} target="_blank" rel="noreferrer">
          {t('pullRequests.evidence.recordingOpen')}
        </a>
      </p>
    </div>
  );
}
