import { mkdtemp, readdir, readFile, rm, stat, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PAUSE_ABOVE_PRESSURE_LEVELS, type SettingsChange } from '@agent-factory/domain';
import { ConfigInvalidError, parseAgentFactoryConfig, projectOf } from './agent-factory-config.ts';
import { ConfigEditRefusedError, editConfigText } from './config-document.ts';
import { ConfigFile } from './config-file.ts';
import { FileSettingsDocument } from './file-settings-document.ts';

const EXAMPLE = new URL('../../../../config/config.example.yaml', import.meta.url);
const HOME = '/home/operator/.agent-factory';
const USER_HOME = '/home/operator';
const CONFIG_PATH = `${HOME}/config.yaml`;
const NOW = new Date('2026-10-10T07:30:00.000Z');
const ROLE_CHANGE: SettingsChange = { kind: 'role', project: null, role: 'reviewer', model: 'opus', effort: 'high', maxBudgetUsd: 4.5, maxTurns: 80 };

function parse(text: string): ReturnType<typeof parseAgentFactoryConfig> {
  return parseAgentFactoryConfig(text, HOME, CONFIG_PATH, USER_HOME);
}

function changedLines(before: string, after: string): readonly string[] {
  const original = new Set(before.split('\n'));
  return after.split('\n').filter((line) => !original.has(line));
}

function comments(text: string): readonly string[] {
  return text.split('\n').filter((line) => line.trimStart().startsWith('#'));
}

const MINIMAL = [
  'version: 1',
  'resources:',
  '  minimumFreeMemoryPercent: 40 # keep the laptop usable',
  'projects:',
  '  - id: storefront',
  '    name: Storefront',
  '    forge: { kind: github, repository: example-org/storefront }',
  '    commitIdentity: { name: Example Factory, email: factory@example.invalid }',
  '  - id: ledger',
  '    name: Ledger',
  '    forge: { kind: local, repository: example-org/ledger }',
  '    commitIdentity: { name: Example Factory, email: factory@example.invalid }',
  '    concurrency: { issues: 1, ceiling: 2 }',
  '',
].join('\n');

describe('editing the configuration document', () => {
  it('changes only the edited fields of a default role and keeps every comment', async () => {
    const text = await readFile(EXAMPLE, 'utf8');
    const edited = editConfigText(text, ROLE_CHANGE);
    expect(comments(edited)).toEqual(comments(text));
    expect(changedLines(text, edited)).toEqual(['    reviewer: { model: opus, effort: high, maxBudgetUsd: 4.5, maxTurns: 80, timeoutMinutes: 20 }']);
    expect(projectOf(parse(edited), 'ledger').roles.reviewer).toMatchObject({ model: 'opus', effort: 'high', maxBudgetUsd: 4.5, maxTurns: 80 });
  });

  it('writes a role override inside the project, creating the keys it lacks', () => {
    const edited = editConfigText(MINIMAL, { ...ROLE_CHANGE, project: 'ledger', role: 'implementer', model: 'claude-opus-4-1[1m]' });
    expect(changedLines(MINIMAL, edited)).toEqual([
      '    roles:',
      '      implementer:',
      '        model: "claude-opus-4-1[1m]"',
      '        effort: high',
      '        maxBudgetUsd: 4.5',
      '        maxTurns: 80',
    ]);
    const config = parse(edited);
    expect(projectOf(config, 'ledger').roles.implementer).toMatchObject({ model: 'claude-opus-4-1[1m]', effort: 'high', maxTurns: 80 });
    expect(projectOf(config, 'storefront').roles.implementer).toMatchObject({ model: 'opus', effort: 'low', escalation: { model: 'opus', effort: 'high' } });
  });

  it('creates the default roles section a file left to its defaults', () => {
    const edited = editConfigText(MINIMAL, ROLE_CHANGE);
    expect(edited.endsWith('defaults:\n  roles:\n    reviewer:\n      model: opus\n      effort: high\n      maxBudgetUsd: 4.5\n      maxTurns: 80\n')).toBe(true);
    expect(projectOf(parse(edited), 'storefront').roles.reviewer.maxTurns).toBe(80);
  });

  it('writes the machine limits next to the values already there', () => {
    const edited = editConfigText(MINIMAL, { kind: 'resources', minimumFreeMemoryPercent: 45, pauseAbovePressure: 'warn', maxConcurrentRuns: 2 });
    expect(changedLines(MINIMAL, edited)).toEqual([
      '  minimumFreeMemoryPercent: 45 # keep the laptop usable',
      '  pauseAbovePressure: warn',
      '  maxConcurrentRuns: 2',
    ]);
    expect(parse(edited).resources).toEqual({ minimumFreeMemoryPercent: 45, pauseAbovePressure: 'warn', maxConcurrentRuns: 2 });
  });

  it('writes no daily cap as none, never as zero', () => {
    const none = parse(editConfigText(MINIMAL, { kind: 'budget', dailyCap: { kind: 'none' }, perRunCapUsd: null }));
    expect(none.budget).toMatchObject({ dailyCap: { kind: 'none' }, perRunCapUsd: null });
    const capped = editConfigText(MINIMAL, { kind: 'budget', dailyCap: { kind: 'usd', amount: 30 }, perRunCapUsd: 2 });
    expect(capped.endsWith('budget:\n  dailyCapUsd: 30\n  perRunCapUsd: 2\n')).toBe(true);
    expect(parse(capped).budget).toMatchObject({ dailyCap: { kind: 'usd', amount: 30 }, perRunCapUsd: 2 });
  });

  it('changes the concurrency of one project in its inline map', () => {
    const edited = editConfigText(MINIMAL, { kind: 'concurrency', project: 'ledger', issues: 2, ceiling: 2 });
    expect(changedLines(MINIMAL, edited)).toEqual(['    concurrency: { issues: 2, ceiling: 2 }']);
    expect(projectOf(parse(edited), 'ledger').concurrency).toEqual({ issues: 2, ceiling: 2 });
  });

  it('refuses an unknown project and a document that does not parse', () => {
    expect(() => editConfigText(MINIMAL, { kind: 'concurrency', project: 'billing', issues: 1, ceiling: 1 })).toThrow(ConfigEditRefusedError);
    expect(() => editConfigText(MINIMAL, { kind: 'concurrency', project: 'billing', issues: 1, ceiling: 1 })).toThrow('it declares no project billing');
    expect(() => editConfigText('resources:\n  maxConcurrentRuns: 1\n  maxConcurrentRuns: 2\n', { kind: 'resources', minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal', maxConcurrentRuns: 1 })).toThrow(
      /does not parse/,
    );
  });

  it('keeps the example parseable for every resources change inside the bounds', async () => {
    const text = await readFile(EXAMPLE, 'utf8');
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 90 }), fc.constantFrom(...PAUSE_ABOVE_PRESSURE_LEVELS), fc.integer({ min: 1, max: 16 }), (percent, pressure, runs) => {
        const config = parse(editConfigText(text, { kind: 'resources', minimumFreeMemoryPercent: percent, pauseAbovePressure: pressure, maxConcurrentRuns: runs }));
        return config.resources.minimumFreeMemoryPercent === percent && config.resources.maxConcurrentRuns === runs;
      }),
      { numRuns: 25 },
    );
  });
});

describe('the configuration file', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'factory-config-file-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('replaces the file atomically with the same permissions and keeps the previous one as a backup', async () => {
    const path = join(directory, 'config.yaml');
    await writeFile(path, 'first: 1\n');
    await chmod(path, 0o600);
    const file = new ConfigFile(path, join(directory, 'config-backups'), { now: () => NOW });
    const backup = await file.replace('second: 2\n');
    expect(await readFile(path, 'utf8')).toBe('second: 2\n');
    expect(await readFile(backup, 'utf8')).toBe('first: 1\n');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(backup).toContain('config-2026-10-10T07-30-00-000Z-');
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('validates the edited text before writing and leaves the file untouched when it is refused', async () => {
    const path = join(directory, 'config.yaml');
    const text = await readFile(EXAMPLE, 'utf8');
    await writeFile(path, text);
    const document = new FileSettingsDocument(new ConfigFile(path, join(directory, 'config-backups'), { now: () => NOW }), parse);
    await expect(document.apply({ kind: 'concurrency', project: 'storefront', issues: 2, ceiling: 9 })).rejects.toBeInstanceOf(ConfigInvalidError);
    expect(await readFile(path, 'utf8')).toBe(text);
    const written = await document.apply(ROLE_CHANGE);
    expect(projectOf(parse(await readFile(path, 'utf8')), 'storefront').roles.reviewer.model).toBe('opus');
    expect(await readFile(written.backupPath, 'utf8')).toBe(text);
  });
});
