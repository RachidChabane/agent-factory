import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { MAX_KEY_FRAMES, SCREENSHOT_EXTENSIONS, VIDEO_EXTENSIONS } from './constants.ts';

const MISSING_FILE_CODE = 'ENOENT';
const PATH_SEPARATOR = '/';
const CURRENT_DIRECTORY_PREFIX = /^\.\//;

export interface MediaFile {
  /** Relative to the output directory, with `/` separators. */
  readonly path: string;
  readonly size: number;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

async function listFiles(directory: string, root: string): Promise<readonly MediaFile[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE) return [];
    throw error;
  }
  const files: MediaFile[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path, root)));
    else if (entry.isFile()) files.push({ path: relative(root, path).split(sep).join(PATH_SEPARATOR), size: (await stat(path)).size });
  }
  return files;
}

/** Every file under the output directory whose extension is one of the given ones. */
export async function mediaFiles(output: string, extensions: readonly string[]): Promise<readonly MediaFile[]> {
  return (await listFiles(output, output)).filter((file) => extensions.includes(extensionOf(file.path)));
}

export function videoFiles(output: string): Promise<readonly MediaFile[]> {
  return mediaFiles(output, VIDEO_EXTENSIONS);
}

export function screenshotFiles(output: string): Promise<readonly MediaFile[]> {
  return mediaFiles(output, SCREENSHOT_EXTENSIONS);
}

/** The film is the largest video; of equal sizes, the first in path order. */
export function largestVideo(videos: readonly MediaFile[]): string | null {
  return [...videos].sort((left, right) => right.size - left.size || left.path.localeCompare(right.path))[0]?.path ?? null;
}

function namesPath(path: string, keyFrame: string): boolean {
  const named = keyFrame.replace(CURRENT_DIRECTORY_PREFIX, '');
  return path === named || path.endsWith(`${PATH_SEPARATOR}${named}`);
}

/**
 * The screenshots to keep: the last one in path order is the final screenshot, then come the
 * key frames the report names, at most `MAX_KEY_FRAMES` of them.
 */
export function selectScreenshots(paths: readonly string[], keyFrames: readonly string[]): readonly string[] {
  const ordered = paths.toSorted((left, right) => left.localeCompare(right));
  const final = ordered.at(-1);
  if (final === undefined) return [];
  const named = keyFrames.flatMap((keyFrame) => ordered.find((path) => namesPath(path, keyFrame)) ?? []);
  return [...new Set([final, ...named])].slice(0, MAX_KEY_FRAMES + 1);
}
