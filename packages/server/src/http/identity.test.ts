import { describe, expect, it } from 'vitest';
import { IDENTITY_HEADER, identify } from './identity.ts';

const LOOPBACK_ONLY = { kind: 'none' } as const;
const TAILNET = { kind: 'tailscale', allowedLogins: [] } as const;
const RESTRICTED = { kind: 'tailscale', allowedLogins: ['alex@example.com'] } as const;

describe('identifying the operator', () => {
  it('lets the machine itself in on loopback and refuses other addresses without an identity', () => {
    expect(identify({}, '127.0.0.1', LOOPBACK_ONLY)).toEqual({ allowed: true, operator: null });
    expect(identify({}, '::1', LOOPBACK_ONLY)).toEqual({ allowed: true, operator: null });
    expect(identify({}, '192.0.2.10', LOOPBACK_ONLY)).toMatchObject({ allowed: false });
  });

  it('takes the operator from the tailnet identity header', () => {
    expect(identify({ [IDENTITY_HEADER]: ' dana@example.com ' }, '100.64.0.2', TAILNET)).toEqual({ allowed: true, operator: 'dana@example.com' });
    expect(identify({}, '127.0.0.1', TAILNET)).toEqual({ allowed: false, reason: `the ${IDENTITY_HEADER} header is required` });
  });

  it('admits only the allowed logins when the configuration lists them', () => {
    expect(identify({ [IDENTITY_HEADER]: 'alex@example.com' }, '100.64.0.2', RESTRICTED)).toEqual({ allowed: true, operator: 'alex@example.com' });
    expect(identify({ [IDENTITY_HEADER]: 'riley@example.com' }, '100.64.0.3', RESTRICTED)).toEqual({
      allowed: false,
      reason: 'riley@example.com is not one of the logins allowed to use this cockpit',
    });
  });
});
