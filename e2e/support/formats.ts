import { createFormatters } from '../../packages/cockpit/src/i18n/formatters.ts';

const ENGLISH = 'en';
const JUST_NOW = 'just now';
/** The time zone the browsers of the specs are set to. */
const BROWSER_TIME_ZONE = 'UTC';

/** The numbers and dates of the cockpit written the way an English reader sees them in the browsers of the specs. */
export const english = createFormatters(ENGLISH, { justNow: JUST_NOW }, BROWSER_TIME_ZONE);
