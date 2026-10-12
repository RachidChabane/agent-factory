/** One commit as the changelog sees it: its Conventional Commit header, and whether it breaks compatibility. */
export interface ChangelogCommit {
  readonly sha: string;
  readonly type: string;
  readonly scope: string | null;
  readonly description: string;
  readonly breaking: boolean;
}

export interface ReleaseSection {
  readonly version: string;
  /** The release day, as YYYY-MM-DD. */
  readonly date: string;
  readonly commits: readonly ChangelogCommit[];
  /** The web page of the repository, to link each commit; null for no links. */
  readonly repositoryUrl: string | null;
}

export const CHANGELOG_TITLE = '# Changelog';
export const RELEASE_COMMIT_TYPE = 'chore';
export const RELEASE_COMMIT_SCOPE = 'release';
const VERSION_HEADING_PREFIX = '## ';
const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<description>.+)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /m;
const SEMANTIC_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const GITHUB_REMOTE = /github\.com[:/](?<path>[^/]+\/[^/]+?)(?:\.git)?\/?$/;
const GITHUB_WEB_ORIGIN = 'https://github.com';
const SHORT_SHA_LENGTH = 7;
const NEWLINE = '\n';
const PARAGRAPH = '\n\n';

/** The groups of a section, in the order they are written, each with the commit types it holds. */
export const CHANGELOG_GROUPS: readonly { readonly title: string; readonly types: readonly string[] | null }[] = [
  { title: 'Features', types: ['feat'] },
  { title: 'Fixes', types: ['fix'] },
  { title: 'Performance', types: ['perf'] },
  { title: 'Other changes', types: null },
];
const BREAKING_TITLE = 'Breaking changes';

export class InvalidVersionError extends Error {
  constructor(version: string) {
    super(`${JSON.stringify(version)} is not a semantic version such as 1.4.0`);
    this.name = 'InvalidVersionError';
  }
}

export function assertVersion(version: string): string {
  if (!SEMANTIC_VERSION.test(version)) throw new InvalidVersionError(version);
  return version;
}

/** The commit as the changelog sees it, or null for a commit that is not a Conventional Commit or is a release. */
export function parseCommit(sha: string, subject: string, body: string): ChangelogCommit | null {
  const match = HEADER.exec(subject.trim());
  const groups = match?.groups;
  if (groups === undefined) return null;
  const type = groups['type'] ?? '';
  const scope = groups['scope'] ?? null;
  if (type === RELEASE_COMMIT_TYPE && scope === RELEASE_COMMIT_SCOPE) return null;
  return { sha, type, scope, description: groups['description'] ?? '', breaking: groups['bang'] !== undefined || BREAKING_FOOTER.test(body) };
}

function line(commit: ChangelogCommit, repositoryUrl: string | null): string {
  const short = commit.sha.slice(0, SHORT_SHA_LENGTH);
  const reference = repositoryUrl === null ? short : `[${short}](${repositoryUrl}/commit/${commit.sha})`;
  const scope = commit.scope === null ? '' : `**${commit.scope}:** `;
  return `- ${scope}${commit.description} (${reference})`;
}

function group(title: string, commits: readonly ChangelogCommit[], repositoryUrl: string | null): string | null {
  if (commits.length === 0) return null;
  return `### ${title}${PARAGRAPH}${commits.map((commit) => line(commit, repositoryUrl)).join(NEWLINE)}`;
}

/** The section of one release: its heading, then its commits by group, the breaking ones first. */
export function renderSection(section: ReleaseSection): string {
  const known = CHANGELOG_GROUPS.flatMap((entry) => entry.types ?? []);
  const groups = [
    group(BREAKING_TITLE, section.commits.filter((commit) => commit.breaking), section.repositoryUrl),
    ...CHANGELOG_GROUPS.map((entry) =>
      group(
        entry.title,
        section.commits.filter((commit) => (entry.types === null ? !known.includes(commit.type) : entry.types.includes(commit.type))),
        section.repositoryUrl,
      ),
    ),
  ].filter((text): text is string => text !== null);
  return [`${VERSION_HEADING_PREFIX}${section.version} (${section.date})`, ...groups].join(PARAGRAPH);
}

/** The changelog with a new section on top of the earlier ones. */
export function prependSection(changelog: string | null, section: string): string {
  const earlier = (changelog ?? '').replace(CHANGELOG_TITLE, '').trim();
  return [CHANGELOG_TITLE, section, ...(earlier === '' ? [] : [earlier])].join(PARAGRAPH) + NEWLINE;
}

/** The body of a release's section, without its heading, as the notes of the release; null when it has none. */
export function sectionOf(changelog: string, version: string): string | null {
  const heading = `${VERSION_HEADING_PREFIX}${version} (`;
  const start = changelog.split(NEWLINE).findIndex((text) => text.startsWith(heading));
  if (start === -1) return null;
  const lines = changelog.split(NEWLINE).slice(start + 1);
  const end = lines.findIndex((text) => text.startsWith(VERSION_HEADING_PREFIX));
  return (end === -1 ? lines : lines.slice(0, end)).join(NEWLINE).trim();
}

/** The web page of a GitHub repository from its remote URL, or null for any other remote. */
export function repositoryPage(remote: string): string | null {
  const path = GITHUB_REMOTE.exec(remote.trim())?.groups?.['path'];
  return path === undefined ? null : `${GITHUB_WEB_ORIGIN}/${path}`;
}
