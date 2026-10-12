import { mkdtemp, readdir, readFile, rm, stat, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PAUSE_ABOVE_PRESSURE_LEVELS, type SettingsChange } from '@agent-factory/domain';
import { ConfigEditRefusedError, editConfigText } from './config-document.ts';
import { ConfigFile } from './config-file.ts';
import { ConfigInvalidError, parseFactoryConfig } from './factory-config.ts';
import { FileSettingsDocument } from './file-settings-document.ts';

const EXAMPLE = new URL('../../../../config/config.example.yaml', import.meta.url);
const HOME = '/home/operator/.agent-factory';
const USER_HOME = '/home/operator';
const CONFIG_PATH = `${HOME}/config.yaml`;
const NOW = new Date('2026-10-10T07:30:00.000Z');
const ROLE_CHANGE: SettingsChange = { kind: 'role', role: 'reviewer', model: 'opus', effort: 'high', maxBudgetUsd: 4.5, maxTurns: 80 };

function parse(text: string): ReturnType<typeof parseFactoryConfig> {
  return parseFactoryConfig(text, HOME, CONFIG_PATH, USER_HOME);
}

function changedLines(before: string, after: string): readonly string[] {
  const original = new Set(before.split('\n'));
  return after.split('\n').filter((line) => !original.has(line));
}

describe('editing the configuration document', () => {
  it('changes only the edited role fields and keeps every comment and the key order', async () => {
    const text = await readFile(EXAMPLE, 'utf8');
    const edited = editConfigText(text, ROLE_CHANGE);
    expect(edited.split('\n').filter((line) => line.trimStart().startsWith('#'))).toEqual(text.split('\n').filter((line) => line.trimStart().startsWith('#')));
    expect(changedLines(text, edited).length).toBeLessThanOrEqual(4);
    expect(parse(edited).roles.reviewer).toMatchObject({ model: 'opus', effort: 'high', maxBudgetUsd: 4.5, maxTurns: 80 });
    expect(Object.keys(parse(edited).roles)).toEqual(Object.keys(parse(text).roles));
  });

  it('writes the limits and creates the keys a configuration left to their defaults', async () => {
    const text = await readFile(EXAMPLE, 'utf8');
    const edited = editConfigText(text, { kind: 'limits', concurrentIssues: 2, minimumFreeMemoryPercent: 45, pauseAbovePressure: 'warn' });
    const config = parse(edited);
    expect(config.concurrency).toEqual({ issues: 2, ceiling: 3 });
    expect(config.resources).toEqual({ minimumFreeMemoryPercent: 45, pauseAbovePressure: 'warn' });
  });

  it('writes the caps, a zero daily cap meaning no cap', async () => {
    const text = await readFile(EXAMPLE, 'utf8');
    const config = parse(editConfigText(text, { kind: 'caps', dailyCapUsd: 0, perRunCapUsd: 6, pauseAtUtilization: 0.7 }));
    expect(config.budget).toEqual({ thresholds: { session: 0.9, weekly_all: 0.7, weekly_scoped: 0.7 }, dailyCapUsd: null, perRunCapUsd: 6 });
  });

  it('keeps flow maps, spacing and comments of a compact configuration, and appends a section it lacked', () => {
    const text = [
      'target: { owner: acme, name: widgets, clonePath: /src/widgets }',
      'concurrency: { issues: 1, ceiling: 3 }',
      'resources:',
      '  minimumFreeMemoryPercent: 40 # keep the laptop usable',
      'roles:',
      '  acceptance-author: { model: haiku, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }',
      '  implementer: { model: haiku, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5, escalation: { model: sonnet, effort: medium } }',
      '  reviewer: { model: haiku, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }',
      'gate: { niceness: null }',
      'conventionalCommits: { defaultScope: repo }',
      'github: { mode: local, commitIdentity: { name: Factory, email: factory@example.invalid } }',
      '',
    ].join('\n');
    const role = editConfigText(text, { ...ROLE_CHANGE, model: 'claude-opus-4-1[1m]' });
    expect(changedLines(text, role)).toEqual([
      '  reviewer: { model: "claude-opus-4-1[1m]", effort: high, maxBudgetUsd: 4.5, maxTurns: 80, timeoutMinutes: 5 }',
    ]);
    const limits = editConfigText(text, { kind: 'limits', concurrentIssues: 2, minimumFreeMemoryPercent: 45, pauseAbovePressure: 'warn' });
    expect(changedLines(text, limits)).toEqual([
      'concurrency: { issues: 2, ceiling: 3 }',
      '  minimumFreeMemoryPercent: 45 # keep the laptop usable',
      '  pauseAbovePressure: warn',
    ]);
    const caps = editConfigText(text, { kind: 'caps', dailyCapUsd: 0, perRunCapUsd: 2, pauseAtUtilization: 0.8 });
    expect(caps.endsWith('budget:\n  dailyCapUsd: null\n  perRunCapUsd: 2\n  sevenDayPauseUtilization: 0.8\n')).toBe(true);
    expect(parse(caps).budget).toEqual({ thresholds: { session: 0.9, weekly_all: 0.8, weekly_scoped: 0.8 }, dailyCapUsd: null, perRunCapUsd: 2 });
    expect(parse(role).roles.reviewer.model).toBe('claude-opus-4-1[1m]');
  });

  it('adds a key to a flow map that lacks it', () => {
    const text = 'budget: { fiveHourPauseUtilization: 0.9 }\n';
    expect(editConfigText(text, { kind: 'caps', dailyCapUsd: 30, perRunCapUsd: 2, pauseAtUtilization: 0.8 })).toBe(
      'budget: { fiveHourPauseUtilization: 0.9, dailyCapUsd: 30, perRunCapUsd: 2, sevenDayPauseUtilization: 0.8 }\n',
    );
  });

  it('refuses a role the configuration does not declare', async () => {
    const text = (await readFile(EXAMPLE, 'utf8')).replace(/\n {2}auditor:[^\n]*(\n {4}[^\n]*)*/, '');
    expect(() => editConfigText(text, { ...ROLE_CHANGE, role: 'auditor' })).toThrow(ConfigEditRefusedError);
  });

  it('refuses a document with a duplicate key instead of dropping one', () => {
    const text = 'gate:\n  commandsBeforeAcceptance:\n    - name: lint-helm\n      run: mise run lint:helm\n      network: one\n      network: two\n';
    expect(() => editConfigText(text, { kind: 'limits', concurrentIssues: 1, minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' })).toThrow(
      /does not parse/,
    );
  });

  it('keeps the document parseable for every limits change inside the bounds', async () => {
    const text = await readFile(EXAMPLE, 'utf8');
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 10, max: 90 }),
        fc.constantFrom(...PAUSE_ABOVE_PRESSURE_LEVELS),
        (concurrentIssues, minimumFreeMemoryPercent, pauseAbovePressure) => {
          const config = parse(editConfigText(text, { kind: 'limits', concurrentIssues, minimumFreeMemoryPercent, pauseAbovePressure }));
          return config.concurrency.issues === concurrentIssues && config.resources.minimumFreeMemoryPercent === minimumFreeMemoryPercent;
        },
      ),
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
    const text = (await readFile(EXAMPLE, 'utf8')).replace('ceiling: 3', 'ceiling: 1');
    await writeFile(path, text);
    const document = new FileSettingsDocument(new ConfigFile(path, join(directory, 'config-backups'), { now: () => NOW }), parse);
    await expect(document.apply({ kind: 'limits', concurrentIssues: 2, minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' })).rejects.toBeInstanceOf(
      ConfigInvalidError,
    );
    expect(await readFile(path, 'utf8')).toBe(text);
    const written = await document.apply(ROLE_CHANGE);
    expect(parse(await readFile(path, 'utf8')).roles.reviewer.model).toBe('opus');
    expect(await readFile(written.backupPath, 'utf8')).toBe(text);
  });
});
