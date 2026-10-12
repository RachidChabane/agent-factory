import type { IncomingHttpHeaders } from 'node:http';
import type { RemoteAccessConfig } from '../config/agent-factory-config.ts';

export const IDENTITY_HEADER = 'tailscale-user-login';
export const LOOPBACK_ADDRESSES: readonly string[] = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

export type IdentityDecision =
  | { readonly allowed: true; readonly operator: string | null }
  | { readonly allowed: false; readonly reason: string };

/**
 * Who is asking. On loopback the operator is the machine's user. Through Tailscale the identity
 * header names them, and when the configuration lists allowed logins, only those get in.
 */
export function identify(headers: IncomingHttpHeaders, remoteAddress: string | undefined, access: RemoteAccessConfig): IdentityDecision {
  const header = headers[IDENTITY_HEADER];
  const login = (Array.isArray(header) ? header[0] : header)?.trim() ?? '';
  if (login !== '') {
    if (access.kind === 'tailscale' && access.allowedLogins.length > 0 && !access.allowedLogins.includes(login)) {
      return { allowed: false, reason: `${login} is not one of the logins allowed to use this cockpit` };
    }
    return { allowed: true, operator: login };
  }
  if (access.kind === 'tailscale') return { allowed: false, reason: `the ${IDENTITY_HEADER} header is required` };
  if (remoteAddress !== undefined && LOOPBACK_ADDRESSES.includes(remoteAddress)) return { allowed: true, operator: null };
  return { allowed: false, reason: `requests from ${remoteAddress ?? 'an unknown address'} need the ${IDENTITY_HEADER} header` };
}
