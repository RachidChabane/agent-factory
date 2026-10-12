import { useNow } from '../app/context.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';

export const TIME_MODES = ['ago', 'until', 'dateTime', 'date', 'time'] as const;
export type TimeMode = (typeof TIME_MODES)[number];

interface TimeProps {
  readonly iso: string;
  readonly mode?: TimeMode | undefined;
  readonly className?: string | undefined;
}

/** An instant written the way the operator reads it, with the exact date and time one hover away. */
export function Time({ iso, mode = 'ago', className }: TimeProps) {
  const { fmt } = useI18n();
  const now = useNow();
  const text = {
    ago: () => fmt.ago(iso, now),
    until: () => fmt.until(iso, now),
    dateTime: () => fmt.dateTime(iso),
    date: () => fmt.date(iso),
    time: () => fmt.time(iso),
  }[mode]();
  return (
    <time className={className} dateTime={iso} title={fmt.absolute(iso)}>
      {text}
    </time>
  );
}
