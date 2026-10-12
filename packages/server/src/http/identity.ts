import type { IncomingHttpHeaders } from 'node:http';

export const IDENTITY_HEADER = 'tailscale-user-login';
export const LOOPBACK_ADDRESSES: readonly string[] = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

export type IdentityDecision =
  | { readonly allowed: true; readonly operator: string | null }
  | { readonly allowed: false; readonly reason: string };

export function identify(headers: IncomingHttpHeaders, remoteAddress: string | undefined, tailnet: boolean): IdentityDecision {
  const header = headers[IDENTITY_HEADER];
  const login = Array.isArray(header) ? header[0] : header;
  if (login !== undefined && login.trim() !== '') return { allowed: true, operator: login.trim() };
  if (tailnet) return { allowed: false, reason: `the ${IDENTITY_HEADER} header is required` };
  if (remoteAddress !== undefined && LOOPBACK_ADDRESSES.includes(remoteAddress)) return { allowed: true, operator: null };
  return { allowed: false, reason: `requests from ${remoteAddress ?? 'an unknown address'} need the ${IDENTITY_HEADER} header` };
}
