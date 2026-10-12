import type { ReactNode } from 'react';
import type { Reading } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { ReadingKind } from '../model/freshness.ts';
import { EmptyState } from '../ui/components/EmptyState.tsx';
import type { ReadVerb } from './ReadStamp.tsx';
import { ReadStamp } from './ReadStamp.tsx';

interface ReadingViewProps<Value> {
  readonly reading: Reading<Value>;
  readonly kind: ReadingKind;
  readonly verb?: ReadVerb | undefined;
  /** Why there is nothing to show when the source was never read. */
  readonly notRead?: string | undefined;
  readonly isEmpty?: ((value: Value) => boolean) | undefined;
  /** Why the value, read successfully, holds nothing. */
  readonly empty?: string | undefined;
  readonly children: (value: Value) => ReactNode;
}

/**
 * Shows a value read from outside the factory in each of its states: never read, the read failed
 * with nothing kept, empty, or present, with the time of the read and, when the latest attempt
 * failed, its error beside the value it left in place.
 */
export function ReadingView<Value>({ reading, kind, verb, notRead, isEmpty, empty, children }: ReadingViewProps<Value>) {
  const { t } = useI18n();
  const { value, readAt, error } = reading;
  const stamp = <ReadStamp readAt={readAt} error={value === null ? null : error} kind={kind} verb={verb} />;
  if (value === null) {
    return (
      <div className="reading-block">
        <EmptyState compact title={error === null ? (notRead ?? t('reading.never')) : t('reading.failedNoValue')} description={error ?? undefined} />
        {error === null ? null : <div className="reading-block__stamp">{stamp}</div>}
      </div>
    );
  }
  const body = isEmpty?.(value) === true ? <EmptyState compact title={empty ?? t('reading.never')} /> : children(value);
  return (
    <div className="reading-block">
      <div className="reading-block__stamp">{stamp}</div>
      {body}
    </div>
  );
}

interface OptionalReadingViewProps<Value> extends Omit<ReadingViewProps<Value>, 'reading'> {
  /** The reading, or null when nothing is configured to read it from. */
  readonly reading: Reading<Value> | null;
  /** Why there is nothing to show when no source is configured. */
  readonly absent: string;
}

/** A reading view for a source that may not be configured at all, which it says in words. */
export function OptionalReadingView<Value>({ reading, absent, ...rest }: OptionalReadingViewProps<Value>) {
  return reading === null ? <EmptyState compact title={absent} /> : <ReadingView reading={reading} {...rest} />;
}
