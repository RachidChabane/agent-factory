import { describe, expect, it } from 'vitest';
import { subjectHref } from './activity.ts';

describe('subjectHref', () => {
  it('points an event at the page of its subject, in its project', () => {
    expect(subjectHref('storefront', 'issue/45')).toBe('/projects/storefront/issues/45');
    expect(subjectHref('storefront', 'pr/57')).toBe('/projects/storefront/pull-requests/57');
    expect(subjectHref('storefront', 'release/1.8.2')).toBe('/projects/storefront/releases/1.8.2');
    expect(subjectHref('storefront', 'audit/bfd32d7')).toBe('/projects/storefront/audits/bfd32d7');
    expect(subjectHref('storefront', 'request/R-15')).toBe('/projects/storefront/requests/R-15');
    expect(subjectHref('storefront', 'deployment/staging')).toBe('/projects/storefront/delivery');
    expect(subjectHref('storefront', 'health/staging')).toBe('/projects/storefront/delivery');
  });

  it('points a run at its page whatever the project', () => {
    expect(subjectHref(null, 'run/run_96e1d0')).toBe('/runs/run_96e1d0');
    expect(subjectHref('ledger', 'run/run_72d8c0')).toBe('/runs/run_72d8c0');
  });

  it('gives no page to an event of the installation or to an unknown subject', () => {
    expect(subjectHref(null, 'issue/45')).toBeNull();
    expect(subjectHref(null, 'usage/personal')).toBeNull();
    expect(subjectHref('storefront', 'settings')).toBeNull();
    expect(subjectHref('storefront', 'issue/not-a-number')).toBeNull();
  });
});
