import { NotificationDeliveryError } from './errors.ts';

const JSON_CONTENT_TYPE = 'application/json; charset=UTF-8';
export const OPEN_IN_COCKPIT_LABEL = 'Open in cockpit';
const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX_EXCLUSIVE = 300;

const CONTENT_TYPE_HEADER = 'Content-Type';

export type NotifyFetchFunction = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
) => Promise<{ readonly status: number }>;

export interface WebhookEndpoint {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly fetch: NotifyFetchFunction;
  readonly timeoutMs: number;
}

function isSuccessStatus(status: number): boolean {
  return status >= HTTP_SUCCESS_MIN && status < HTTP_SUCCESS_MAX_EXCLUSIVE;
}

function withJsonContentType(headers: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const declared = Object.keys(headers).some((name) => name.toLowerCase() === CONTENT_TYPE_HEADER.toLowerCase());
  return declared ? headers : { [CONTENT_TYPE_HEADER]: JSON_CONTENT_TYPE, ...headers };
}

async function send(channel: string, endpoint: WebhookEndpoint, body: string): Promise<number> {
  try {
    const response = await endpoint.fetch(endpoint.url, {
      method: 'POST',
      headers: withJsonContentType(endpoint.headers),
      body,
      signal: AbortSignal.timeout(endpoint.timeoutMs),
    });
    return response.status;
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown error';
    throw new NotificationDeliveryError(`${channel} request failed: ${reason}`);
  }
}

export async function postJson(channel: string, endpoint: WebhookEndpoint, payload: unknown): Promise<void> {
  const status = await send(channel, endpoint, JSON.stringify(payload));
  if (!isSuccessStatus(status)) throw new NotificationDeliveryError(`${channel} answered HTTP ${status}`, status);
}
