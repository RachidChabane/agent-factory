import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acceptanceAuthorValues, implementerValues, reviewerValues } from '@agent-factory/application';
import type { IssueSpec } from '@agent-factory/domain';
import { FileRolePromptCatalog, placeholdersOf, RolePromptMissingError, UnknownPlaceholderError } from './fileRolePromptCatalog.ts';

const PLUGIN_ROLES_DIRECTORY = fileURLToPath(new URL('../../../plugin/roles/', import.meta.url));
const REPOSITORY = { owner: 'acme', name: 'widgets' };
const SPEC: IssueSpec = {
  number: 42,
  title: 'Link mockups to their conversation',
  type: 'ui',
  need: 'Operators lose track of the source conversation.',
  acceptanceCriteria: ['The header links the conversation.'],
  outOfScope: ['Editing the conversation.'],
  expectedProof: 'A Playwright journey.',
  dependsOn: [],
  commitKind: null,
};

describe('FileRolePromptCatalog', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'factory-roles-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('substitutes every placeholder, including repeated ones', async () => {
    await writeFile(join(directory, 'reviewer.md'), 'Review {{repository}}.\n{{ spec }}\nAgain {{repository}}.\n');
    const catalog = await FileRolePromptCatalog.load(directory);
    expect(catalog.render('reviewer', { repository: 'acme/widgets', spec: 'S', unused: 'x' })).toBe(
      'Review acme/widgets.\nS\nAgain acme/widgets.\n',
    );
  });

  it('refuses a template placeholder without a value', async () => {
    await writeFile(join(directory, 'implementer.md'), '{{spec}} {{checks}} {{secret}}');
    const catalog = await FileRolePromptCatalog.load(directory);
    expect(() => catalog.render('implementer', { spec: 'S' })).toThrow(UnknownPlaceholderError);
    expect(() => catalog.render('implementer', { spec: 'S' })).toThrow('{{checks}}, {{secret}}');
  });

  it('refuses a role without a template', async () => {
    const catalog = await FileRolePromptCatalog.load(directory);
    expect(() => catalog.render('auditor', {})).toThrow(RolePromptMissingError);
  });

  it('renders the shipped pipeline role templates with the values the pipeline provides', async () => {
    const catalog = await FileRolePromptCatalog.load(PLUGIN_ROLES_DIRECTORY);
    const checks = [{ path: 'app/e2e/link.spec.ts', content: 'test()' }];
    const rendered = [
      catalog.render('acceptance-author', { ...acceptanceAuthorValues(REPOSITORY, SPEC) }),
      catalog.render('implementer', { ...implementerValues(REPOSITORY, SPEC, checks) }),
      catalog.render('reviewer', { ...reviewerValues(REPOSITORY, SPEC, checks, 'diff --git a/x b/x') }),
    ];
    for (const prompt of rendered) {
      expect(placeholdersOf(prompt)).toEqual([]);
      expect(prompt).toContain('acme/widgets');
      expect(prompt).toContain('# Issue #42: Link mockups to their conversation (type ui)');
    }
    expect(rendered[2]).toContain('diff --git a/x b/x');
  });

  it('renders the shipped auditor and challenger templates with their values', async () => {
    const catalog = await FileRolePromptCatalog.load(PLUGIN_ROLES_DIRECTORY);
    const auditor = catalog.render('auditor', { repository: 'acme/widgets', change: 'Commit: abc', diff: 'diff --git a/x b/x' });
    const challenger = catalog.render('challenger', { repository: 'acme/widgets', request: 'R', images: 'none', knowledge: 'K' });
    expect(placeholdersOf(auditor)).toEqual([]);
    expect(placeholdersOf(challenger)).toEqual([]);
    expect(auditor).toContain('cited but not recorded');
    expect(challenger).toContain('has the verdict ask');
  });
});
