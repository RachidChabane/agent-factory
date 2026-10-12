import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acceptanceAuthorValues, DEFAULT_PROJECT_CONVENTIONS, implementerValues, reviewerValues } from '@agent-factory/application';
import type { IssueSpec } from '@agent-factory/domain';
import { FileRolePromptCatalog, placeholdersOf, RolePromptMissingError, UnknownPlaceholderError } from './fileRolePromptCatalog.ts';

const PLUGIN_ROLES_DIRECTORY = fileURLToPath(new URL('../../../plugin/roles/', import.meta.url));
const REPOSITORY = { owner: 'acme', name: 'widgets' };
const GATE = {
  commandsBeforeAcceptance: [{ name: 'lint', run: 'npm run lint' }],
  commandsAfterAcceptance: [{ name: 'schemas', run: 'npm run check:schemas', network: { reason: 'downloads the schemas it validates against' } }],
  commandTimeoutMs: 600_000,
  environment: {},
  niceness: 10,
};
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
  films: [],
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
      catalog.render('acceptance-author', { ...acceptanceAuthorValues(REPOSITORY, SPEC, DEFAULT_PROJECT_CONVENTIONS.typology.get('ui'), false) }),
      catalog.render('implementer', { ...implementerValues(REPOSITORY, SPEC, checks, GATE) }),
      catalog.render('reviewer', { ...reviewerValues(REPOSITORY, SPEC, checks, 'diff --git a/x b/x') }),
    ];
    for (const prompt of rendered) {
      expect(placeholdersOf(prompt)).toEqual([]);
      expect(prompt).toContain('acme/widgets');
      expect(prompt).toContain('# Issue #42: Link mockups to their conversation (type ui)');
    }
    expect(rendered[2]).toContain('diff --git a/x b/x');
    expect(rendered[1]).toContain(
      'runs the repository\'s gate in a sandbox of its own: `npm run lint`, the frozen acceptance checks, `npm run check:schemas` (with network access: downloads the schemas it validates against).',
    );
  });

  it('tells the acceptance author about films only when the project films, without a stray line otherwise', async () => {
    const catalog = await FileRolePromptCatalog.load(PLUGIN_ROLES_DIRECTORY);
    const type = DEFAULT_PROJECT_CONVENTIONS.typology.get('ui');
    const without = catalog.render('acceptance-author', { ...acceptanceAuthorValues(REPOSITORY, SPEC, type, false) });
    const filming = catalog.render('acceptance-author', { ...acceptanceAuthorValues(REPOSITORY, SPEC, type, true) });
    expect(without).not.toContain('Films:');
    expect(without).toContain('Do not choose one.\n\nWhen the checks are written');
    expect(filming).toContain('- A film that the spec declares in its `Films:` header');
    expect(filming).toContain('never write a check for what only a film can show.\n\nWhen the checks are written');
    expect(placeholdersOf(filming)).toEqual([]);
  });

  it('renders the shipped auditor and challenger templates with their values', async () => {
    const catalog = await FileRolePromptCatalog.load(PLUGIN_ROLES_DIRECTORY);
    const auditor = catalog.render('auditor', { repository: 'acme/widgets', change: 'Commit: abc', diff: 'diff --git a/x b/x' });
    const challenger = catalog.render('challenger', { repository: 'acme/widgets', request: 'R', images: 'none', knowledge: 'K', issueTypes: 'feature, fix' });
    expect(placeholdersOf(auditor)).toEqual([]);
    expect(placeholdersOf(challenger)).toEqual([]);
    expect(auditor).toContain('cited but not recorded');
    expect(challenger).toContain('has the verdict ask');
  });
});
