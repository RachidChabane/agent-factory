import { EVIDENCE_CACHE_ISSUE_PREFIX, evidenceDirectory } from '../pipeline/evidence.ts';
import type { FilmPhase } from '../pipeline/journal-events.ts';

export const FILMS_DIRECTORY = 'films';
export const MP4_EXTENSION = '.mp4';
/** Appended to the path of a video that is not an MP4 to name its transcoded copy. */
export const TRANSCODED_SUFFIX = '.h264.mp4';
const PATH_SEPARATOR = '/';
const EXTENSION_SEPARATOR = '.';
const JSON_EXTENSION = '.json';
const KEY_FRAME_INFIX = '-frame-';

/** The factory's own copy of the files a film recorded, one directory per issue. */
export function filmStoreRoot(cacheDirectory: string, issueNumber: number): string {
  return `${cacheDirectory}${PATH_SEPARATOR}${EVIDENCE_CACHE_ISSUE_PREFIX}${issueNumber}`;
}

export function filmScenarioPath(scenario: string): string {
  return `${FILMS_DIRECTORY}${PATH_SEPARATOR}${scenario}`;
}

/** The output directory of one recording, relative to the film store root. */
export function filmPhasePath(scenario: string, phase: FilmPhase): string {
  return `${filmScenarioPath(scenario)}${PATH_SEPARATOR}${phase}`;
}

export function filmStoreFile(scenario: string, phase: FilmPhase, relativePath: string): string {
  return `${filmPhasePath(scenario, phase)}${PATH_SEPARATOR}${relativePath}`;
}

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf(EXTENSION_SEPARATOR);
  return dot <= path.lastIndexOf(PATH_SEPARATOR) ? '' : path.slice(dot).toLowerCase();
}

export function isMp4(path: string): boolean {
  return extensionOf(path) === MP4_EXTENSION;
}

/** Where the transcoded copy of a video that is not an MP4 goes, next to it. */
export function transcodedVideoPath(relativePath: string): string {
  return `${relativePath}${TRANSCODED_SUFFIX}`;
}

/** Where a film lands on the pull request's branch. */
export function filmBranchDirectory(issueNumber: number, scenario: string): string {
  return `${evidenceDirectory(issueNumber)}${PATH_SEPARATOR}${filmScenarioPath(scenario)}`;
}

export function filmBranchVideo(issueNumber: number, scenario: string, phase: FilmPhase): string {
  return `${filmBranchDirectory(issueNumber, scenario)}${PATH_SEPARATOR}${phase}${MP4_EXTENSION}`;
}

export function filmBranchReport(issueNumber: number, scenario: string, phase: FilmPhase): string {
  return `${filmBranchDirectory(issueNumber, scenario)}${PATH_SEPARATOR}${phase}-report${JSON_EXTENSION}`;
}

/** The final screenshot is `<phase>.<ext>`; the key frames are `<phase>-frame-<n>.<ext>`, each keeping its own extension. */
export function filmBranchScreenshot(issueNumber: number, scenario: string, phase: FilmPhase, position: number, sourcePath: string): string {
  const name = position === 0 ? phase : `${phase}${KEY_FRAME_INFIX}${position}`;
  return `${filmBranchDirectory(issueNumber, scenario)}${PATH_SEPARATOR}${name}${extensionOf(sourcePath)}`;
}
