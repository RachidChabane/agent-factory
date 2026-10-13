import { filmsHeaderLines, formatSpecSections, SPEC_FILE_HEADERS } from '../../packages/application/src/spec/index.ts';
import type { StorySpec } from '../../packages/server/src/demo/story/story-types.ts';

const TYPE_LABEL_PREFIX = 'type:';
const BLANK_LINE = '\n\n';
const FIRST_NUMBER = 1;

/** A story's spec as the spec file `agent-factory issue create` reads: its title, its type label, its films and its four sections. */
export function specFileOf(spec: StorySpec): string {
  const films = spec.films ?? [];
  const header = [`${SPEC_FILE_HEADERS.title} ${spec.title}`, `${SPEC_FILE_HEADERS.labels} ${TYPE_LABEL_PREFIX}${spec.type}`, ...filmsHeaderLines(films)].join('\n');
  const body = formatSpecSections({
    number: FIRST_NUMBER,
    title: spec.title,
    type: spec.type,
    need: spec.need,
    acceptanceCriteria: [...spec.acceptanceCriteria],
    outOfScope: [...spec.outOfScope],
    expectedProof: spec.expectedProof,
    dependsOn: [],
    commitKind: null,
    films: [...films],
  });
  return `${header}${BLANK_LINE}${body}`;
}
