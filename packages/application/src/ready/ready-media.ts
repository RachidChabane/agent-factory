import { filmStoreRoot } from '../film/film-layout.ts';
import { isImagePath } from '../pipeline/pull-request-body.ts';
import type { PipelineJournal } from '../pipeline/pipeline-journal.ts';
import type { FilmPhaseRecord } from '../pipeline/journal-events.ts';

const PATH_SEPARATOR = '/';
const LABEL_SEPARATOR = ' · ';
export const EVIDENCE_LABEL = 'evidence';
const FILM_PHASES = ['before', 'after'] as const;

/** A file of a pull request to make reachable, with the label its link carries in the notice. */
export interface MediaFile {
  readonly path: string;
  readonly label: string;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf(PATH_SEPARATOR) + 1);
}

function labelled(group: string, phase: string, path: string): string {
  return [group, phase, fileName(path)].join(LABEL_SEPARATOR);
}

function phaseFiles(root: string, scenario: string, phase: (typeof FILM_PHASES)[number], record: FilmPhaseRecord): readonly MediaFile[] {
  const stored = [record.storeVideo, ...record.storeScreenshots.slice(0, 1)];
  return stored.map((path) => ({ path: `${root}${PATH_SEPARATOR}${path}`, label: labelled(scenario, phase, path) }));
}

/**
 * The media of a pull request: the film of each scenario before and after with its final screenshot, then the
 * images of its evidence. Paths lead into the factory's own copies, so they stay valid after the branch moves on.
 */
export function readyMediaOf(journal: PipelineJournal, evidenceCacheDirectory: string): readonly MediaFile[] {
  const root = filmStoreRoot(evidenceCacheDirectory, journal.issueNumber);
  const films = journal.films.flatMap((film) => FILM_PHASES.flatMap((phase) => phaseFiles(root, film.scenario, phase, film[phase])));
  const images = (journal.evidence?.bundle.files ?? [])
    .filter((file) => isImagePath(file.sourcePath))
    .map((file) => ({ path: `${root}${PATH_SEPARATOR}${file.phase}${PATH_SEPARATOR}${file.sourcePath}`, label: labelled(EVIDENCE_LABEL, file.phase, file.sourcePath) }));
  return [...films, ...images];
}
