import { FACTORY_BRANCH_PREFIX } from '@agent-factory/domain';

export const MAX_SLUG_LENGTH = 40;
export const FALLBACK_SLUG = 'issue';

const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_ALPHANUMERIC_RUN = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const DASH = '-';
const DECOMPOSITION = 'NFKD';

export function slugify(title: string): string {
  const slug = title
    .normalize(DECOMPOSITION)
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RUN, DASH)
    .replace(EDGE_DASHES, '');
  const bounded = slug.length <= MAX_SLUG_LENGTH ? slug : slug.slice(0, MAX_SLUG_LENGTH).replace(EDGE_DASHES, '');
  return bounded === '' ? FALLBACK_SLUG : bounded;
}

export function issueBranchName(issueNumber: number, title: string): string {
  return `${FACTORY_BRANCH_PREFIX}${issueNumber}${DASH}${slugify(title)}`;
}
