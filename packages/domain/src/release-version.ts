/** A semantic version, optionally with a pre-release and build part. */
export const SEMANTIC_VERSION = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/;
const VERSION_SEPARATORS = ['v', '-', '@', '/', '_'];

/** The version a release pull request announces in its title, such as "chore(main): release 1.4.0". */
export function releaseVersionOf(title: string): string | null {
  return SEMANTIC_VERSION.exec(title)?.[1] ?? null;
}

/** Whether a tag names this exact version: the tag ends with it, right after a separator such as "v" or "-". */
export function tagNamesVersion(tag: string, version: string): boolean {
  if (!tag.endsWith(version)) return false;
  const before = tag.slice(0, tag.length - version.length);
  return before === '' || VERSION_SEPARATORS.includes(before.at(-1) ?? '');
}

/** The published tag of a release pull request's version, which makes the pull request superseded; null when none. */
export function supersedingTag(title: string, tags: readonly string[]): string | null {
  const version = releaseVersionOf(title);
  if (version === null) return null;
  return tags.find((tag) => tagNamesVersion(tag, version)) ?? null;
}
