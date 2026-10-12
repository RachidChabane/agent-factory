import { useId, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';

export const IMAGE_COMPARE_INITIAL_PERCENT = 50;
const PERCENT_MAX = 100;

interface ImageCompareProps {
  readonly beforeUrl: string;
  readonly afterUrl: string;
  readonly beforeLabel?: string | undefined;
  readonly afterLabel?: string | undefined;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export function ImageCompare({ beforeUrl, afterUrl, beforeLabel, afterLabel, width, height, alt }: ImageCompareProps) {
  const { t } = useI18n();
  const before = beforeLabel ?? t('compare.before');
  const after = afterLabel ?? t('compare.after');
  const [position, setPosition] = useState(IMAGE_COMPARE_INITIAL_PERCENT);
  const id = useId();
  return (
    <div className="ds-compare" style={{ aspectRatio: `${width} / ${height}` }}>
      <img className="ds-compare__image" src={beforeUrl} alt={`${alt} — ${before}`} width={width} height={height} draggable={false} />
      <img
        className="ds-compare__image ds-compare__image--after"
        src={afterUrl}
        alt={`${alt} — ${after}`}
        width={width}
        height={height}
        draggable={false}
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
      />
      <span className="ds-compare__tag ds-compare__tag--before">{before}</span>
      <span className="ds-compare__tag ds-compare__tag--after">{after}</span>
      <span className="ds-compare__divider" style={{ left: `${position}%` }} aria-hidden="true">
        <span className="ds-compare__handle" />
      </span>
      <label htmlFor={id} className="visually-hidden">
        {t('compare.slider')}
      </label>
      <input
        id={id}
        className="ds-compare__range"
        type="range"
        min={0}
        max={PERCENT_MAX}
        value={position}
        onChange={(event) => setPosition(Number(event.currentTarget.value))}
        aria-valuetext={t('compare.position', { percent: position })}
      />
    </div>
  );
}
