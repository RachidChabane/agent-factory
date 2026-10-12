const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const HOURS_SHOWN_BEFORE_DAYS = 48;

/** How long ago a reading was taken, as an operator reads it: "just now", "4 min ago", "3 h ago", "2 days ago". */
export function ageText(at: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / MILLISECONDS_PER_MINUTE);
  if (minutes < 1) return 'just now';
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min ago`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_SHOWN_BEFORE_DAYS) return `${hours} h ago`;
  return `${Math.floor(hours / HOURS_PER_DAY)} days ago`;
}

/** A time with its age, so that a value is never shown without when it was read. */
export function readingTime(at: string, now: Date): string {
  return `${at} (${ageText(new Date(at), now)})`;
}
