import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  NO_REFERENCE_MOUNTS,
  REFERENCE_COPY_RULE,
  REFERENCE_PROMPT_HEADING,
  REFERENCE_READ_ONLY_RULE,
  referenceCopyRules,
  referencePromptSection,
  type ReferenceMount,
} from './reference-access.ts';

const COMMIT = '1d3e4a9ce003af09489551fd6398fc44c24069cc';
const TOKENS: ReferenceMount = { name: 'design-tokens', repository: 'example-org/design-tokens', ref: 'v1.0.0', commit: COMMIT, path: '/factory/projects/storefront/references/design-tokens@v1.0.0' };
const ICONS: ReferenceMount = { name: 'icons', repository: 'example-org/icons', ref: 'v2', commit: 'a'.repeat(40), path: '/factory/projects/storefront/references/icons@v2' };

describe('referenceCopyRules', () => {
  it('allows cp and cp -R from the snapshot directory, and mkdir -p for the destination, nothing broader', () => {
    expect(referenceCopyRules([TOKENS])).toEqual(['Bash(mkdir -p *)', `Bash(cp ${TOKENS.path}/*)`, `Bash(cp -R ${TOKENS.path}/*)`]);
  });

  it('renders one mkdir rule and two copy rules per reference, in order, and none without a reference', () => {
    expect(referenceCopyRules([TOKENS, ICONS])).toHaveLength(5);
    expect(referenceCopyRules([TOKENS, ICONS])[3]).toBe(`Bash(cp ${ICONS.path}/*)`);
    expect(referenceCopyRules([])).toEqual([]);
  });
});

describe('referenceCopyRules, whatever the snapshots', () => {
  const snapshotPath = fc.array(fc.stringMatching(/^[a-z][a-z0-9._@-]{0,8}$/), { minLength: 1, maxLength: 5 }).map((segments) => `/${segments.join('/')}`);

  it('allows a copy from under each snapshot directory and from nowhere else, with no other form of cp', () => {
    fc.assert(
      fc.property(fc.uniqueArray(snapshotPath, { maxLength: 5 }), (paths) => {
        const rules = referenceCopyRules(paths.map((path) => ({ ...TOKENS, path })));
        expect(rules).toHaveLength(paths.length === 0 ? 0 : 1 + paths.length * 2);
        paths.forEach((path, index) => {
          expect(rules.slice(1 + index * 2, 3 + index * 2)).toEqual([`Bash(cp ${path}/*)`, `Bash(cp -R ${path}/*)`]);
        });
      }),
    );
  });
});

describe('referencePromptSection', () => {
  it('is absent without references', () => {
    expect(referencePromptSection([], true)).toBeNull();
  });

  it('lists each reference with its name, repository, ref, commit and local path', () => {
    const section = referencePromptSection([TOKENS, ICONS], true) ?? '';

    expect(section.startsWith(REFERENCE_PROMPT_HEADING)).toBe(true);
    expect(section).toContain(`- \`design-tokens\`: \`example-org/design-tokens\` at \`v1.0.0\` (commit \`${COMMIT}\`), read from \`${TOKENS.path}\``);
    expect(section).toContain(`- \`icons\`: \`example-org/icons\` at \`v2\``);
    expect(section).toContain(`\`${ICONS.path}\``);
  });

  it('tells a writing role to copy with cp, that a copy stays read-only, and never to modify a snapshot', () => {
    const section = referencePromptSection([TOKENS], true) ?? '';

    expect(section).toContain(REFERENCE_COPY_RULE);
    expect(section).toContain('A copy keeps the read-only mode of the original.');
    expect(section).toContain('Create a missing destination directory with `mkdir -p <directory>` first.');
    expect(section.endsWith(REFERENCE_READ_ONLY_RULE)).toBe(true);
  });

  it('does not offer cp to a role that cannot copy', () => {
    const section = referencePromptSection([TOKENS], false) ?? '';

    expect(section).not.toContain('`cp');
    expect(section).toContain(REFERENCE_READ_ONLY_RULE);
  });
});

describe('NO_REFERENCE_MOUNTS', () => {
  it('mounts nothing', async () => {
    expect(await NO_REFERENCE_MOUNTS()).toEqual([]);
  });
});
