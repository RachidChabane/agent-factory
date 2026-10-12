import type { ReferenceView } from '../../../contract/index.ts';
import { failedAfter, NEVER_READ, readOn } from '../readings.ts';
import type { FixtureClock } from '../time.ts';

const DESIGN_TOKENS_READ_SECONDS_AGO = 20;
const LEGACY_CHECKOUT_READ_MINUTES_AGO = 2;
const ICON_SET_READ_SECONDS_AGO = 45;
/** Older than a reading of this kind may be: the reference list has one stale reading and one that failed. */
const BRAND_ASSETS_READ_MINUTES_AGO = 40;

export const READY_SNAPSHOT_COMMIT = '1d3e4a9ce003af09489551fd6398fc44c24069cc';
export const LEGACY_CHECKOUT_COMMIT = '9f2b7c4e18a05d63b7e1c0d94a2f58e6b3a71d09';
export const ICON_SET_COMMIT = '5c0e8a1d77b3f6429e0a4d18c6b2f93a1e7d4b56';
export const BRAND_ASSETS_FAILURE = "EACCES: permission denied, open '/srv/example-org/factory/projects/storefront/references/brand-assets@v1.8.0.commit'";

/** The repositories the storefront's specifications cite, each snapshot in one of the states it can be in. */
export function storefrontReferences(clock: FixtureClock): ReferenceView[] {
  return [
    {
      name: 'design-tokens',
      repository: 'example-org/design-tokens',
      ref: 'v2.4.0',
      snapshot: readOn({ status: 'ready', commit: READY_SNAPSHOT_COMMIT }, clock.secondsAgo(DESIGN_TOKENS_READ_SECONDS_AGO)),
    },
    {
      name: 'legacy-checkout',
      repository: 'example-org/legacy-checkout',
      ref: 'production-2025-03',
      snapshot: readOn({ status: 'ready', commit: LEGACY_CHECKOUT_COMMIT }, clock.minutesAgo(LEGACY_CHECKOUT_READ_MINUTES_AGO)),
    },
    {
      name: 'icon-set',
      repository: 'example-org/icon-set',
      ref: 'v3.0.0',
      snapshot: readOn({ status: 'not-built', commit: ICON_SET_COMMIT }, clock.secondsAgo(ICON_SET_READ_SECONDS_AGO)),
    },
    {
      name: 'brand-assets',
      repository: 'example-org/brand-assets',
      ref: 'v1.8.0',
      snapshot: failedAfter(readOn({ status: 'missing-ref', commit: null }, clock.minutesAgo(BRAND_ASSETS_READ_MINUTES_AGO)), BRAND_ASSETS_FAILURE),
    },
    { name: 'copy-deck', repository: 'example-org/copy-deck', ref: 'v0.9.1', snapshot: NEVER_READ },
  ];
}
