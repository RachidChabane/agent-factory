import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import type { RolePromptCatalog } from '@agent-factory/application';
import { AGENT_ROLES, type AgentRole } from '@agent-factory/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileRolePromptCatalog, UnknownPlaceholderError, RolePromptMissingError } from './fileRolePromptCatalog.ts';
import { LayeredRolePromptCatalog, RolePromptOverrideMissingError } from './layeredRolePromptCatalog.ts';

class RecordingCatalog implements RolePromptCatalog {
  readonly rendered: AgentRole[] = [];

  render(role: AgentRole): string {
    this.rendered.push(role);
    return `base prompt of ${role}`;
  }
}

describe('LayeredRolePromptCatalog', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'factory-layered-roles-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function overrideFile(name: string, content: string): Promise<string> {
    const path = join(directory, name);
    await writeFile(path, content);
    return path;
  }

  it('renders a role from its override and every other role from the base catalog', async () => {
    const base = new RecordingCatalog();
    const catalog = await LayeredRolePromptCatalog.load(base, { reviewer: await overrideFile('reviewer.md', 'Review {{repository}} for the platform team.') });
    expect(catalog.render('reviewer', { repository: 'acme/widgets' })).toBe('Review acme/widgets for the platform team.');
    expect(catalog.render('implementer', {})).toBe('base prompt of implementer');
    expect(base.rendered).toEqual(['implementer']);
  });

  it('renders every role from the base catalog when the project overrides none', async () => {
    const base = new RecordingCatalog();
    const catalog = await LayeredRolePromptCatalog.load(base, {});
    for (const role of AGENT_ROLES) expect(catalog.render(role, {})).toBe(`base prompt of ${role}`);
    expect(base.rendered).toEqual([...AGENT_ROLES]);
  });

  it('substitutes the placeholders of an override as the base catalog does, repeated ones and spaced ones included', async () => {
    await writeFile(join(directory, 'implementer.md'), 'Implement {{ spec }}.\nAgain {{spec}} in {{repository}}.\n');
    const base = await FileRolePromptCatalog.load(directory);
    const catalog = await LayeredRolePromptCatalog.load(base, { auditor: await overrideFile('auditor.md', 'Audit {{ spec }} in {{repository}}, twice: {{spec}}.') });
    const values = { spec: 'S', repository: 'acme/widgets', unused: 'x' };
    expect(catalog.render('auditor', values)).toBe('Audit S in acme/widgets, twice: S.');
    expect(catalog.render('implementer', values)).toBe(base.render('implementer', values));
  });

  it('refuses an override placeholder without a value, listing every one', async () => {
    const catalog = await LayeredRolePromptCatalog.load(new RecordingCatalog(), { reviewer: await overrideFile('reviewer.md', '{{spec}} {{checks}} {{secret}}') });
    expect(() => catalog.render('reviewer', { spec: 'S' })).toThrow(UnknownPlaceholderError);
    expect(() => catalog.render('reviewer', { spec: 'S' })).toThrow('The reviewer prompt uses placeholders with no value: {{checks}}, {{secret}}');
  });

  it('does not take a placeholder for a value inherited from Object.prototype', async () => {
    const catalog = await LayeredRolePromptCatalog.load(new RecordingCatalog(), { reviewer: await overrideFile('reviewer.md', '{{constructor}}') });
    expect(() => catalog.render('reviewer', {})).toThrow(UnknownPlaceholderError);
  });

  it('keeps the error of the base catalog for a role neither layer has', async () => {
    const base = await FileRolePromptCatalog.load(directory);
    const catalog = await LayeredRolePromptCatalog.load(base, { reviewer: await overrideFile('reviewer.md', 'Review.') });
    expect(() => catalog.render('auditor', {})).toThrow(RolePromptMissingError);
  });

  it('fails to load when an override file is missing, naming the role and the path', async () => {
    const path = join(directory, 'prompts', 'reviewer.md');
    const loading = LayeredRolePromptCatalog.load(new RecordingCatalog(), { implementer: await overrideFile('implementer.md', 'ok'), reviewer: path });
    await expect(loading).rejects.toBeInstanceOf(RolePromptOverrideMissingError);
    await expect(loading).rejects.toThrow(`The prompt override for role reviewer does not exist: ${path}`);
    await expect(loading).rejects.toMatchObject({ role: 'reviewer', path });
  });

  it('fails to load when an override path is not a file, with the reason of the file system', async () => {
    await expect(LayeredRolePromptCatalog.load(new RecordingCatalog(), { reviewer: directory })).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it('keeps an override for exactly the roles it names', async () => {
    const roles = fc.subarray([...AGENT_ROLES]);
    await fc.assert(
      fc.asyncProperty(roles, async (overridden) => {
        const files = await Promise.all(overridden.map(async (role) => [role, await overrideFile(`${role}.md`, `override of ${role}`)] as const));
        const catalog = await LayeredRolePromptCatalog.load(new RecordingCatalog(), Object.fromEntries(files));
        for (const role of AGENT_ROLES) {
          expect(catalog.render(role, {})).toBe(overridden.includes(role) ? `override of ${role}` : `base prompt of ${role}`);
        }
      }),
      { numRuns: 30 },
    );
  });
});
