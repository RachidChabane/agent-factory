import type { HealthCheckResult, HealthProbe } from '@agent-factory/application';

export const HEALTH_REQUEST_TIMEOUT_MS = 10_000;
export const HEALTHY_STATUS_MIN = 200;
export const HEALTHY_STATUS_MAX_EXCLUSIVE = 400;
export const WAKING_STATUSES: readonly number[] = [502, 503, 504];
export const DEFAULT_WAKE_UP_BUDGET_MS = 90_000;
export const FIRST_RETRY_DELAY_MS = 2_000;
export const MAX_RETRY_DELAY_MS = 15_000;
const RETRY_DELAY_GROWTH = 2;

export interface HttpHealthTarget {
  readonly name: string;
  readonly url: string;
}

export type FetchFunction = (url: string, init: { readonly redirect: 'manual'; readonly signal: AbortSignal }) => Promise<{ readonly status: number }>;

export interface HttpHealthProbeSettings {
  readonly targets: readonly HttpHealthTarget[];
  readonly timeoutMs?: number;
  readonly wakeUpBudgetMs?: number;
  readonly fetchFunction?: FetchFunction;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
}

interface Attempt {
  readonly status: number | null;
  readonly detail: string;
}

export function isHealthyStatus(status: number): boolean {
  return status >= HEALTHY_STATUS_MIN && status < HEALTHY_STATUS_MAX_EXCLUSIVE;
}

function isWaking(attempt: Attempt): boolean {
  return attempt.status === null || WAKING_STATUSES.includes(attempt.status);
}

function waitFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export class HttpHealthProbe implements HealthProbe {
  private readonly settings: HttpHealthProbeSettings;

  constructor(settings: HttpHealthProbeSettings) {
    this.settings = settings;
  }

  check(): Promise<readonly HealthCheckResult[]> {
    return Promise.all(this.settings.targets.map((target) => this.probe(target)));
  }

  private async probe(target: HttpHealthTarget): Promise<HealthCheckResult> {
    const sleep = this.settings.sleep ?? waitFor;
    const now = this.settings.now ?? Date.now;
    const deadline = now() + (this.settings.wakeUpBudgetMs ?? DEFAULT_WAKE_UP_BUDGET_MS);
    let delay = FIRST_RETRY_DELAY_MS;
    let attempt = await this.request(target.url);
    let retries = 0;
    while (isWaking(attempt) && now() + delay <= deadline) {
      await sleep(delay);
      retries += 1;
      delay = Math.min(delay * RETRY_DELAY_GROWTH, MAX_RETRY_DELAY_MS);
      attempt = await this.request(target.url);
    }
    const passed = attempt.status !== null && isHealthyStatus(attempt.status);
    const detail = retries === 0 ? attempt.detail : `${attempt.detail} after ${retries} retries while the environment woke up`;
    return { name: target.name, passed, detail };
  }

  private async request(url: string): Promise<Attempt> {
    const fetchFunction = this.settings.fetchFunction ?? fetch;
    try {
      const response = await fetchFunction(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(this.settings.timeoutMs ?? HEALTH_REQUEST_TIMEOUT_MS),
      });
      return { status: response.status, detail: `HTTP ${response.status}` };
    } catch (error) {
      return { status: null, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}
