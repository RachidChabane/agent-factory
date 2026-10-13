import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertVersion, parseCommit, prependSection, renderSection, repositoryPage, sectionOf, type ChangelogCommit } from './changelog.ts';
import { publishRelease } from './github-release.ts';

/**
 * The release tool: `prepare <version>` writes the new section of CHANGELOG.md from the commits since the previous
 * release tag, sets the version of the root package.json and of the plugin, and prints the section; `notes <version>`
 * prints the section of an existing release, as its release notes; `publish <version>` creates the GitHub Release of
 * its tag with those notes, from GH_TOKEN and the repository the GitHub Actions environment names.
 */
const CHANGELOG_FILE = 'CHANGELOG.md';
const MANIFEST_FILE = 'package.json';
const PLUGIN_MANIFEST_FILE = 'packages/plugin/.claude-plugin/plugin.json';
/** The files whose `version` is the factory's: the installed factory reports it, and the plugin ships with it. */
const VERSIONED_MANIFESTS: readonly string[] = [MANIFEST_FILE, PLUGIN_MANIFEST_FILE];
const JSON_INDENT = 2;
const TAG_PREFIX = 'v';
const FIELD_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';
const UTF8 = 'utf8';
const DATE_LENGTH = 10;
const EXIT_USAGE = 2;
const EXIT_FAILURE = 1;
const USAGE = 'usage: release.ts prepare <version> | notes <version> | publish <version>';
const COMMANDS: ReadonlySet<string> = new Set(['prepare', 'notes', 'publish']);
const DEFAULT_API_URL = 'https://api.github.com';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: UTF8, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryGit(root: string, ...args: string[]): string | null {
  try {
    return git(root, ...args);
  } catch {
    return null;
  }
}

function previousTag(root: string): string | null {
  return tryGit(root, 'describe', '--tags', '--abbrev=0', '--match', `${TAG_PREFIX}*`);
}

function commitsSince(root: string, tag: string | null): readonly ChangelogCommit[] {
  const range = tag === null ? 'HEAD' : `${tag}..HEAD`;
  const log = git(root, 'log', '--reverse', `--format=%H${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${RECORD_SEPARATOR}`, range);
  return log
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter((record) => record !== '')
    .flatMap((record) => {
      const [sha = '', subject = '', body = ''] = record.split(FIELD_SEPARATOR);
      const commit = parseCommit(sha, subject, body);
      return commit === null ? [] : [commit];
    });
}

function readChangelog(root: string): string | null {
  try {
    return readFileSync(join(root, CHANGELOG_FILE), UTF8);
  } catch {
    return null;
  }
}

function prepare(root: string, version: string): number {
  const remote = tryGit(root, 'remote', 'get-url', 'origin');
  const section = renderSection({
    version,
    date: new Date().toISOString().slice(0, DATE_LENGTH),
    commits: commitsSince(root, previousTag(root)),
    repositoryUrl: remote === null ? null : repositoryPage(remote),
  });
  writeFileSync(join(root, CHANGELOG_FILE), prependSection(readChangelog(root), section));
  for (const manifest of VERSIONED_MANIFESTS) setManifestVersion(root, manifest, version);
  process.stdout.write(`${section}\n`);
  return 0;
}

function setManifestVersion(root: string, file: string, version: string): void {
  const path = join(root, file);
  const manifest: unknown = JSON.parse(readFileSync(path, UTF8));
  if (typeof manifest !== 'object' || manifest === null) throw new Error(`${file} is not an object`);
  writeFileSync(path, `${JSON.stringify({ ...manifest, version }, null, JSON_INDENT)}\n`);
}

function sectionFor(root: string, version: string): string | null {
  const changelog = readChangelog(root);
  const section = changelog === null ? null : sectionOf(changelog, version);
  if (section === null) process.stderr.write(`${CHANGELOG_FILE} has no section for ${version}\n`);
  return section;
}

function notes(root: string, version: string): number {
  const section = sectionFor(root, version);
  if (section === null) return EXIT_FAILURE;
  process.stdout.write(`${section}\n`);
  return 0;
}

async function publish(root: string, version: string): Promise<number> {
  const token = process.env['GH_TOKEN'];
  const repository = process.env['GITHUB_REPOSITORY'];
  if (token === undefined || repository === undefined) {
    process.stderr.write('publish needs GH_TOKEN and GITHUB_REPOSITORY (owner/name)\n');
    return EXIT_USAGE;
  }
  const section = sectionFor(root, version);
  if (section === null) return EXIT_FAILURE;
  const tag = `${TAG_PREFIX}${version}`;
  const outcome = await publishRelease({ apiUrl: process.env['GITHUB_API_URL'] ?? DEFAULT_API_URL, repository, token, tag, notes: section }, fetch);
  process.stdout.write(`${outcome.kind === 'published' ? 'published' : 'already published'}: ${outcome.url}\n`);
  return 0;
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, raw] = argv;
  if (command === undefined || !COMMANDS.has(command) || raw === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return EXIT_USAGE;
  }
  const version = assertVersion(raw.startsWith(TAG_PREFIX) ? raw.slice(TAG_PREFIX.length) : raw);
  const root = git(process.cwd(), 'rev-parse', '--show-toplevel');
  if (command === 'prepare') return prepare(root, version);
  return command === 'notes' ? notes(root, version) : publish(root, version);
}

process.exitCode = await main(process.argv.slice(2));
