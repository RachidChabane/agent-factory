import { API_STATE_PATH } from '@agent-factory/cockpit';
import { LOOPBACK_ADDRESS } from './loopback.ts';

const HTTP_SCHEME = 'http://';

/** How the cockpit answered a request for its state; no status when nothing answered. */
export interface StateAnswer {
  readonly status: number | null;
  readonly detail: string;
}

export type Fetcher = typeof fetch;

/**
 * The cockpit of a running factory, asked for the state it shows. Answering takes a reading of
 * every open pull request's checks, which is what makes a local forge start the gate of a commit.
 */
export class CockpitClient {
  private readonly stateUrl: string;
  private readonly fetcher: Fetcher;
  private readonly requestTimeoutMs: number;

  constructor(port: number, requestTimeoutMs: number, fetcher: Fetcher = fetch) {
    this.stateUrl = `${HTTP_SCHEME}${LOOPBACK_ADDRESS}:${port}${API_STATE_PATH}`;
    this.fetcher = fetcher;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async requestState(): Promise<StateAnswer> {
    try {
      const response = await this.fetcher(this.stateUrl, { signal: AbortSignal.timeout(this.requestTimeoutMs) });
      await response.arrayBuffer();
      return { status: response.status, detail: `GET ${API_STATE_PATH} answered ${response.status}` };
    } catch (error) {
      return { status: null, detail: `GET ${API_STATE_PATH} got no answer: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
