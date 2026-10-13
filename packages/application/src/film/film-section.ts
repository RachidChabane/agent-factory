import { SHORT_SHA_LENGTH } from '../audit/audit-issue-renderer.ts';
import { evidenceCaption } from '../pipeline/evidence.ts';
import { describeOmission } from '../pipeline/evidence-omission.ts';
import type { FilmFinishedRecord, FilmPhaseRecord, OmittedFilmFile } from '../pipeline/journal-events.ts';
import { inlineCode } from '../pipeline/markdown.ts';
import type { ForgeFileLinks } from '../pipeline/pipeline-settings.ts';

export const FILM_SECTION_HEADING = 'Behaviour on video';
const SECTION_START = new RegExp(`^## ${FILM_SECTION_HEADING}[ \\t]*\\r?$`, 'm');
const NEXT_SECTION = /^## /m;
const PARAGRAPH = '\n\n';
const NEWLINE = '\n';
const DASH = '—';

export function filmScenarioHeading(scenario: string): string {
  return `### Scenario ${inlineCode(scenario)}`;
}

function screenshotAlt(title: string, position: number): string {
  return position === 0 ? title : `${title}, key frame ${position}`;
}

function leftOutNote(file: OmittedFilmFile): string {
  return `Left out of the pull request: ${inlineCode(evidenceCaption(file.path))}, ${describeOmission(file)}.`;
}

function phaseBlock(links: ForgeFileLinks, commitSha: string, title: string, sha: string, phase: FilmPhaseRecord): string {
  const leftOut = new Set(phase.omitted.map((file) => file.path));
  const video = leftOut.has(phase.video) ? [] : [`[Watch the recording](${links.file(commitSha, phase.video)})`];
  const screenshots = phase.screenshots.flatMap((path, position) => (leftOut.has(path) ? [] : [`![${screenshotAlt(title, position)}](${links.rawFile(commitSha, path)})`]));
  const facts = phase.facts.map((fact) => `- ${fact.label}: ${fact.value}`).join(NEWLINE);
  const body = [...video, ...phase.omitted.map(leftOutNote), ...screenshots, ...(facts === '' ? [] : [facts])];
  return [`#### ${title} ${DASH} ${sha.slice(0, SHORT_SHA_LENGTH)}`, ...body].join(PARAGRAPH);
}

/** A recorded scenario: the Before and the After, linked at the commit that holds them. */
export function renderFinishedFilm(links: ForgeFileLinks, film: FilmFinishedRecord): string {
  return [
    filmScenarioHeading(film.scenario),
    phaseBlock(links, film.commitSha, 'Before', film.baseSha, film.before),
    phaseBlock(links, film.commitSha, 'After', film.headSha, film.after),
  ].join(PARAGRAPH);
}

export function renderFilmSection(blocks: readonly string[]): string {
  return [`## ${FILM_SECTION_HEADING}`, ...blocks].join(PARAGRAPH);
}

/** The body with its film section replaced by the given one, or ending with it when it has none yet. */
export function replaceFilmSection(body: string, section: string): string {
  const start = SECTION_START.exec(body);
  if (start === null) {
    const trimmed = body.replace(/\s+$/, '');
    return `${trimmed === '' ? '' : `${trimmed}${PARAGRAPH}`}${section}${NEWLINE}`;
  }
  const afterHeading = start.index + start[0].length;
  const next = NEXT_SECTION.exec(body.slice(afterHeading));
  const before = body.slice(0, start.index);
  const rest = next === null ? '' : body.slice(afterHeading + next.index);
  return `${before}${section}${NEWLINE}${rest === '' ? '' : `${NEWLINE}${rest}`}`;
}
