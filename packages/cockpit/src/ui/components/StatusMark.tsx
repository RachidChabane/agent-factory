import type { StatusMark as StatusMarkKind } from '../../model/status.ts';

export const STATUS_MARK_LABELS: Readonly<Record<StatusMarkKind, string>> = {
  running: 'En cours',
  waiting: 'Attend votre action',
  success: 'Réussi',
  failed: 'Échec',
  blocked: 'Bloqué',
  idle: 'En attente',
};

const DEFAULT_SIZE = 16;

interface StatusMarkProps {
  readonly mark: StatusMarkKind;
  readonly size?: number | undefined;
  readonly label?: string | undefined;
}

function Glyph({ mark }: { readonly mark: StatusMarkKind }) {
  switch (mark) {
    case 'running':
      return (
        <>
          <circle cx="8" cy="8" r="6" className="ds-mark__track" />
          <path d="M8 2 A6 6 0 0 1 14 8" className="ds-mark__arc" />
        </>
      );
    case 'waiting':
      return (
        <>
          <circle cx="8" cy="8" r="6.5" className="ds-mark__halo" />
          <circle cx="8" cy="8" r="3.5" className="ds-mark__dot" />
        </>
      );
    case 'success':
      return (
        <>
          <circle cx="8" cy="8" r="6.25" className="ds-mark__ring" />
          <path d="M5.4 8.2 L7.2 9.9 L10.7 6.3" className="ds-mark__stroke" />
        </>
      );
    case 'failed':
      return (
        <>
          <circle cx="8" cy="8" r="6.25" className="ds-mark__ring" />
          <path d="M6 6 L10 10 M10 6 L6 10" className="ds-mark__stroke" />
        </>
      );
    case 'blocked':
      return (
        <>
          <circle cx="8" cy="8" r="6.25" className="ds-mark__ring" />
          <path d="M4.2 11.8 L11.8 4.2" className="ds-mark__stroke" />
        </>
      );
    case 'idle':
      return <circle cx="8" cy="8" r="6" className="ds-mark__ring ds-mark__ring--dashed" />;
  }
}

export function StatusMark({ mark, size = DEFAULT_SIZE, label }: StatusMarkProps) {
  return (
    <svg
      className={`ds-mark ds-mark--${mark}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={label ?? STATUS_MARK_LABELS[mark]}
    >
      <Glyph mark={mark} />
    </svg>
  );
}
