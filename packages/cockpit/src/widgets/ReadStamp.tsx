import { Clock } from 'lucide-react';
import { useNow } from '../app/context.tsx';
import { useMaybeSnapshot } from '../app/hooks.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { ReadingKind } from '../model/freshness.ts';
import { isOlderThan } from '../model/freshness.ts';
import { Badge } from '../ui/components/Badge.tsx';

export const READ_VERBS = ['read', 'checked', 'sampled'] as const;
export type ReadVerb = (typeof READ_VERBS)[number];

interface ReadStampBaseProps {
  /** When the value was last read successfully; null when it never was. */
  readonly readAt: string | null;
  /** The error of the latest attempt, when that attempt failed. */
  readonly error?: string | null | undefined;
  readonly verb?: ReadVerb | undefined;
  /** Words for a value never read, for example "Never checked". */
  readonly neverLabel?: string | undefined;
  readonly className?: string | undefined;
}

/** The age after which the reading is stale: that of its kind, as the installation announces it, or an explicit one. */
export type ReadStampProps = ReadStampBaseProps & ({ readonly kind: ReadingKind } | { readonly staleAfterMs: number });

/**
 * When a value read from outside the factory was read, as an age with the exact time on hover. A
 * value older than its kind allows is marked stale, and the error of a failed read is spelled out
 * next to the value it left in place.
 */
export function ReadStamp(props: ReadStampProps) {
  const { readAt, error = null, verb = 'read', neverLabel, className } = props;
  const { t, fmt } = useI18n();
  const now = useNow();
  const thresholds = useMaybeSnapshot()?.installation.staleAfterMs;
  const thresholdMs = 'staleAfterMs' in props ? props.staleAfterMs : (thresholds?.[props.kind] ?? Number.POSITIVE_INFINITY);
  const stale = isOlderThan(readAt, now, thresholdMs);
  const age = readAt === null ? null : fmt.ago(readAt, now);
  const classes = ['ds-reading', stale ? 'is-stale' : null, error === null ? null : 'has-error', className].filter(Boolean).join(' ');
  return (
    <span className={classes}>
      <span className="ds-reading__main">
        <Clock size={12} aria-hidden="true" />
        {readAt === null || age === null ? (
          <span className="ds-reading__age">{neverLabel ?? t('reading.never')}</span>
        ) : (
          <time className="ds-reading__age" dateTime={readAt} title={fmt.absolute(readAt)}>
            {t(`reading.${verb}`, { age })}
          </time>
        )}
        {stale ? (
          <Badge tone="running" title={t('reading.staleHint', { after: fmt.duration(thresholdMs) })}>
            {t('reading.stale')}
          </Badge>
        ) : null}
      </span>
      {error === null ? null : (
        <span className="ds-reading__error" role="note">
          {age === null ? t('reading.failed', { error }) : t('reading.failedKept', { error, age })}
        </span>
      )}
    </span>
  );
}
