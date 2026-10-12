import type { Evidence } from '../../contract/index.ts';
import { STOREFRONT_ID } from '../../test/fixtures/project-ids.ts';
import { PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { fixtureSnapshot, renderWidget } from '../../test/render.tsx';
import { EvidenceGallery } from './EvidenceGallery.tsx';
import type { EvidenceOf } from './evidence-model.ts';

export const SEARCH_RESULTS_TITLE = 'Search results for "blue sneakers under 60"';
export const CHIPS_TITLE = 'Unit tests of the price phrases and the chips';
export const BEFORE_SHA = '17f331e5033595c05300e9041f625c9938903e3a';

/** The piece of evidence of this kind on the pull request of the fixture world that holds all six kinds. */
function fixtureEvidence<Kind extends Evidence['kind']>(kind: Kind): EvidenceOf<Kind> {
  const found = fixtureSnapshot()
    .projects.find((project) => project.id === STOREFRONT_ID)
    ?.pullRequests.find((pullRequest) => pullRequest.number === PULL_REQUEST.naturalLanguageSearch)
    ?.evidence.find((entry): entry is EvidenceOf<Kind> => entry.kind === kind);
  if (found === undefined) throw new Error(`the fixture pull request holds no ${kind} evidence`);
  return found;
}

export const imageCompare = fixtureEvidence('image-compare');
export const recording = fixtureEvidence('recording');
export const redGreen = fixtureEvidence('red-green');
export const acceptance = fixtureEvidence('acceptance-tests');
export const scores = fixtureEvidence('eval-scores');
export const report = fixtureEvidence('report');

export const show = (evidence: readonly Evidence[], options: Parameters<typeof renderWidget>[1] = {}) => renderWidget(<EvidenceGallery evidence={evidence} />, options);
