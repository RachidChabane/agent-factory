import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { parseAgentFactoryConfig } from './agent-factory-config.ts';
import { ConfigEditRefusedError } from './config-document.ts';
import { newConfigText, ProjectAlreadyDeclaredError, withProjectEntry } from './project-entry.ts';

const HOME = '/home/operator/.agent-factory';
const CONFIG_PATH = `${HOME}/config.yaml`;
const USER_HOME = '/home/operator';

function project(id: string, name = 'Billing API'): Readonly<Record<string, unknown>> & { readonly id: string } {
  return {
    id,
    name,
    forge: { kind: 'local', repository: `example-org/${id}` },
    commitIdentity: { name: 'Example Factory', email: 'factory@example.invalid' },
    gate: { afterAcceptance: [{ name: 'test', run: 'npm test' }] },
  };
}

const EXISTING = `# yaml-language-server: $schema=../schema/config.schema.json
version: 1

server:
  port: 7430

projects:
  # The shop
  - id: storefront
    name: Storefront
    forge: { kind: github, repository: example-org/storefront }
    commitIdentity: { name: Example Factory, email: factory@example.invalid }

  # The catalogue service
  - id: catalogue
    name: Catalogue
    forge: { kind: local, repository: example-org/catalogue }
    commitIdentity: { name: Example Factory, email: factory@example.invalid }

defaults:
  roles:
    implementer: { model: sonnet }
`;

function ids(text: string): readonly string[] {
  return parseAgentFactoryConfig(text, HOME, CONFIG_PATH, USER_HOME).projects.map((entry) => entry.id);
}

describe('adding a project to config.yaml', () => {
  it('writes a new configuration that loads, with the schema comment editors read', () => {
    const text = newConfigText(project('ledger'));
    expect(text.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect(ids(text)).toEqual(['ledger']);
  });

  it('appends after the last project, in the layout of the existing ones, and keeps every comment and section', () => {
    const text = withProjectEntry(EXISTING, project('ledger'), false);
    expect(ids(text)).toEqual(['storefront', 'catalogue', 'ledger']);
    expect(text).toContain('  # The catalogue service\n  - id: catalogue');
    expect(text).toContain('\n  - id: ledger\n    name: Billing API\n');
    expect(text.endsWith('defaults:\n  roles:\n    implementer: { model: sonnet }\n')).toBe(true);
    expect(parse(text).defaults).toEqual({ roles: { implementer: { model: 'sonnet' } } });
  });

  it('refuses to declare a project twice unless asked to replace it', () => {
    expect(() => withProjectEntry(EXISTING, project('catalogue'), false)).toThrow(ProjectAlreadyDeclaredError);
  });

  it('replaces the last project without touching the section that follows it', () => {
    const text = withProjectEntry(EXISTING, project('catalogue', 'Product catalogue'), true);
    expect(ids(text)).toEqual(['storefront', 'catalogue']);
    expect(text).toContain('name: Product catalogue');
    expect(text).not.toContain('name: Catalogue\n');
    expect(text).toContain('\ndefaults:\n  roles:\n');
  });

  it('replaces a project in the middle and keeps the comment above the next one', () => {
    const text = withProjectEntry(EXISTING, project('storefront', 'Shop'), true);
    expect(ids(text)).toEqual(['storefront', 'catalogue']);
    expect(text).toContain('  # The shop\n  - id: storefront\n    name: Shop\n');
    expect(text).toContain('  # The catalogue service\n  - id: catalogue');
  });

  it('adds a projects section to a file that has none', () => {
    const text = withProjectEntry('version: 1\nserver:\n  port: 7430\n', project('ledger'), false);
    expect(ids(text)).toEqual(['ledger']);
  });

  it('refuses a projects list written inline, which it cannot extend without rewriting it', () => {
    expect(() => withProjectEntry('version: 1\nprojects: []\n', project('ledger'), false)).toThrow(ConfigEditRefusedError);
  });

  it('refuses a file that does not parse', () => {
    expect(() => withProjectEntry('version: 1\nprojects:\n  - id: [\n', project('ledger'), false)).toThrow(ConfigEditRefusedError);
  });

  it('always produces a configuration that loads with every project once, whatever ids and names are added', () => {
    const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);
    const name = fc.string({ minLength: 1, maxLength: 30 }).filter((value) => value.trim() !== '');
    fc.assert(
      fc.property(fc.uniqueArray(identifier, { minLength: 1, maxLength: 4 }), name, (added, label) => {
        const [first, ...rest] = added;
        if (first === undefined) return;
        let text = newConfigText(project(first, label));
        for (const id of rest) text = withProjectEntry(text, project(id, label), false);
        expect(ids(text)).toEqual(added);
        const replaced = withProjectEntry(text, project(first, `${label} 2`), true);
        expect(ids(replaced)).toEqual(added);
      }),
    );
  });
});
