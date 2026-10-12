/** A semantic version, optionally with a pre-release and build part. */
export const SEMANTIC_VERSION = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/;
const VERSION_SEPARATORS = ['v', '-', '@', '/', '_'];
const VERSION_PREFIX = /v$/i;
const TRAILING_SEPARATORS = /[-@/_.\s]+$/;
const WHITESPACE = /\s+/;
const RELEASE_WORD = /^release$/i;
const LABEL_END = ':';
const NUMERIC_IDENTIFIER = /^\d+$/;
const BUILD_SEPARATOR = '+';
const PRE_RELEASE_SEPARATOR = '-';
const IDENTIFIER_SEPARATOR = '.';
const VERSION_NUMBERS = 3;

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

function compareIdentifiers(left: string, right: string): number {
  const leftNumeric = NUMERIC_IDENTIFIER.test(left);
  const rightNumeric = NUMERIC_IDENTIFIER.test(right);
  if (leftNumeric && rightNumeric) return Math.sign(Number(left) - Number(right));
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePreReleases(left: string | undefined, right: string | undefined): number {
  if (left === undefined || right === undefined) return left === right ? 0 : left === undefined ? 1 : -1;
  const leftParts = left.split(IDENTIFIER_SEPARATOR);
  const rightParts = right.split(IDENTIFIER_SEPARATOR);
  for (let index = 0; index < Math.min(leftParts.length, rightParts.length); index += 1) {
    const order = compareIdentifiers(leftParts[index] ?? '', rightParts[index] ?? '');
    if (order !== 0) return order;
  }
  return Math.sign(leftParts.length - rightParts.length);
}

interface VersionParts {
  readonly core: readonly number[];
  readonly preRelease: string | undefined;
}

function versionParts(version: string): VersionParts {
  const withoutBuild = version.split(BUILD_SEPARATOR)[0] ?? '';
  const separator = withoutBuild.indexOf(PRE_RELEASE_SEPARATOR);
  const core = separator === -1 ? withoutBuild : withoutBuild.slice(0, separator);
  const preRelease = separator === -1 ? '' : withoutBuild.slice(separator + PRE_RELEASE_SEPARATOR.length);
  return { core: core.split(IDENTIFIER_SEPARATOR).map(Number), preRelease: preRelease === '' ? undefined : preRelease };
}

/** Orders two semantic versions as semver does: numbers first, a pre-release before its release, build data ignored. */
export function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < VERSION_NUMBERS; index += 1) {
    const order = Math.sign((leftParts.core[index] ?? 0) - (rightParts.core[index] ?? 0));
    if (order !== 0) return order;
  }
  return comparePreReleases(leftParts.preRelease, rightParts.preRelease);
}

/** What precedes a version once the "v" glued to it and the separators are dropped: "app-v" gives "app". */
function beforeVersion(text: string): string {
  return text.replace(VERSION_PREFIX, '').replace(TRAILING_SEPARATORS, '');
}

/** The component a tag versions, such as "app" for "app-v1.3.0", or "" for a plain "v1.3.0". */
export function tagComponent(tag: string, version: string): string {
  return beforeVersion(tag.slice(0, tag.length - version.length));
}

/** The component a release title names right before its version, such as "app" in "release app 1.3.0", or "". */
export function titleComponent(title: string, version: string): string {
  const word = beforeVersion(title.slice(0, title.indexOf(version))).split(WHITESPACE).at(-1) ?? '';
  return RELEASE_WORD.test(word) || word.endsWith(LABEL_END) ? '' : word;
}

/**
 * The published tag that supersedes a release pull request: the tag of its own version, or the
 * newest tag of the same component whose version is higher. A pull request announcing a version
 * at or below what is already published is never a pending release. Null when none supersedes it.
 */
export function supersedingTag(title: string, tags: readonly string[]): string | null {
  const version = releaseVersionOf(title);
  if (version === null) return null;
  const exact = tags.find((tag) => tagNamesVersion(tag, version));
  if (exact !== undefined) return exact;
  const component = titleComponent(title, version);
  let newest: { readonly tag: string; readonly version: string } | null = null;
  for (const tag of tags) {
    const tagged = releaseVersionOf(tag);
    if (tagged === null || !tagNamesVersion(tag, tagged) || tagComponent(tag, tagged) !== component) continue;
    if (compareVersions(tagged, version) > 0 && (newest === null || compareVersions(tagged, newest.version) > 0)) newest = { tag, version: tagged };
  }
  return newest?.tag ?? null;
}
