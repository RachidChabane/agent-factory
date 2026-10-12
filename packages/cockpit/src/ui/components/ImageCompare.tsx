import { useId, useState } from 'react';

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

export function ImageCompare({ beforeUrl, afterUrl, beforeLabel = 'Avant', afterLabel = 'Après', width, height, alt }: ImageCompareProps) {
  const [position, setPosition] = useState(IMAGE_COMPARE_INITIAL_PERCENT);
  const id = useId();
  return (
    <div className="ds-compare" style={{ aspectRatio: `${width} / ${height}` }}>
      <img className="ds-compare__image" src={beforeUrl} alt={`${alt} — ${beforeLabel}`} width={width} height={height} draggable={false} />
      <img
        className="ds-compare__image ds-compare__image--after"
        src={afterUrl}
        alt={`${alt} — ${afterLabel}`}
        width={width}
        height={height}
        draggable={false}
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
      />
      <span className="ds-compare__tag ds-compare__tag--before">{beforeLabel}</span>
      <span className="ds-compare__tag ds-compare__tag--after">{afterLabel}</span>
      <span className="ds-compare__divider" style={{ left: `${position}%` }} aria-hidden="true">
        <span className="ds-compare__handle" />
      </span>
      <label htmlFor={id} className="visually-hidden">
        Position du curseur avant / après
      </label>
      <input
        id={id}
        className="ds-compare__range"
        type="range"
        min={0}
        max={PERCENT_MAX}
        value={position}
        onChange={(event) => setPosition(Number(event.currentTarget.value))}
        aria-valuetext={`${position} % avant`}
      />
    </div>
  );
}
