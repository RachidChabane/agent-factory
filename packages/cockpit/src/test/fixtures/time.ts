import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS } from '../../format/format.ts';

export interface FixtureClock {
  readonly now: number;
  secondsAgo(seconds: number): string;
  minutesAgo(minutes: number): string;
  hoursAgo(hours: number): string;
  daysAgo(days: number): string;
  inMinutes(minutes: number): string;
  dateDaysAgo(days: number): string;
}

const ISO_DATE_LENGTH = 10;

export function fixtureClock(now: number): FixtureClock {
  const at = (offset: number) => new Date(now - offset).toISOString();
  return {
    now,
    secondsAgo: (seconds) => at(seconds * SECOND_MS),
    minutesAgo: (minutes) => at(minutes * MINUTE_MS),
    hoursAgo: (hours) => at(hours * HOUR_MS),
    daysAgo: (days) => at(days * DAY_MS),
    inMinutes: (minutes) => at(-minutes * MINUTE_MS),
    dateDaysAgo: (days) => at(days * DAY_MS).slice(0, ISO_DATE_LENGTH),
  };
}

export const REPOSITORY = 'example-org/storefront';
export const GITHUB_URL = `https://github.com/${REPOSITORY}`;
export const DATADOG_URL = 'https://app.datadoghq.example.com/dashboard/storefront';

export function issueUrl(number: number): string {
  return `${GITHUB_URL}/issues/${number}`;
}

export function pullUrl(number: number): string {
  return `${GITHUB_URL}/pull/${number}`;
}

export function actionsUrl(id: string): string {
  return `${GITHUB_URL}/actions/runs/${id}`;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
