/** One production dependency as the notices list it. */
export interface NoticeEntry {
  readonly name: string;
  readonly license: string;
  readonly homepage: string | null;
}

const HEADER = [
  '# Third-party notices',
  '',
  'The production dependencies of Agent Factory and their licences: what the factory and its cockpit ship.',
  'Each stays under its own licence, whose text is in its package; the lockfile holds the versions. This file is',
  'written by `script/third-party-notices` and checked by `script/third-party-notices --check`.',
].join('\n');
const UNKNOWN = 'UNKNOWN';
const NO_HOMEPAGE = '';
const NEWLINE = '\n';
const PARAGRAPH = '\n\n';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function entryOf(license: string, value: unknown): NoticeEntry | null {
  if (!isRecord(value)) return null;
  const homepage = value['homepage'];
  return {
    name: typeof value['name'] === 'string' ? value['name'] : UNKNOWN,
    license: license === '' ? UNKNOWN : license,
    homepage: typeof homepage === 'string' && homepage !== '' ? homepage : null,
  };
}

/** The entries of `pnpm licenses list --json`, one per package, sorted by name; anything else is left out. */
export function entriesOf(listing: unknown): readonly NoticeEntry[] {
  if (!isRecord(listing)) return [];
  return Object.entries(listing)
    .flatMap(([license, packages]) => (Array.isArray(packages) ? packages.map((value: unknown) => entryOf(license, value)) : []))
    .filter((entry): entry is NoticeEntry => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function cell(text: string): string {
  return text.replaceAll('|', '\\|');
}

/** The notices file: a summary by licence, then one row per package. */
export function renderNotices(entries: readonly NoticeEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.license, (counts.get(entry.license) ?? 0) + 1);
  const summary = ['| Licence | Packages |', '|---|---|', ...[...counts].sort(([left], [right]) => left.localeCompare(right)).map(([license, count]) => `| ${cell(license)} | ${count} |`)];
  const rows = [
    '| Package | Licence | Home page |',
    '|---|---|---|',
    ...entries.map((entry) => `| ${cell(entry.name)} | ${cell(entry.license)} | ${entry.homepage ?? NO_HOMEPAGE} |`),
  ];
  return [HEADER, `## Licences (${entries.length} packages)`, summary.join(NEWLINE), '## Packages', rows.join(NEWLINE)].join(PARAGRAPH) + NEWLINE;
}
