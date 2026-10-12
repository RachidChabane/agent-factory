import { API_STATE_PATH } from '@agent-factory/cockpit';
import { MILLISECONDS_PER_SECOND } from './time-units.ts';
import { WatchedSnapshotSchema, type WatchedSnapshot } from './watched-snapshot.ts';

export const REQUEST_TIMEOUT_MS = 10_000;
const HTTP_OK = 200;

/** The factory could not be read: nothing answered, it answered an error, or it answered something this version cannot read. */
export class SnapshotUnavailableError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(reason, options);
    this.name = 'SnapshotUnavailableError';
  }
}

/** Where `watch` reads the factory's state from. */
export interface SnapshotSource {
  read(signal: AbortSignal): Promise<WatchedSnapshot>;
}

function causeOf(error: unknown): string {
  if (error instanceof Error && error.cause instanceof Error) {
    const code: unknown = 'code' in error.cause ? error.cause.code : undefined;
    return typeof code === 'string' ? code : error.cause.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Reads `GET /api/state` of the running factory. */
export class HttpSnapshotSource implements SnapshotSource {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, fetcher: typeof fetch = fetch, timeoutMs: number = REQUEST_TIMEOUT_MS) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
  }

  async read(signal: AbortSignal): Promise<WatchedSnapshot> {
    const url = `${this.baseUrl}${API_STATE_PATH}`;
    let response: Response;
    try {
      response = await this.fetcher(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]), headers: { accept: 'application/json' } });
    } catch (error) {
      if (signal.aborted) throw error;
      const reason = error instanceof Error && error.name === 'TimeoutError' ? `no answer within ${this.timeoutMs / MILLISECONDS_PER_SECOND} s` : causeOf(error);
      throw new SnapshotUnavailableError(`${this.baseUrl} is not reachable: ${reason}`, { cause: error });
    }
    if (response.status !== HTTP_OK) throw new SnapshotUnavailableError(`${url} answered HTTP ${response.status}`);
    const parsed = WatchedSnapshotSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      const [problem] = parsed.error.issues;
      throw new SnapshotUnavailableError(`${url} did not answer a snapshot this version reads: ${problem?.path.join('.') ?? ''} ${problem?.message ?? ''}`.trim());
    }
    return parsed.data;
  }
}
