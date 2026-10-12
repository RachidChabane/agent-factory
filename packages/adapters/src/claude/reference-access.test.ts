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
  it('allows cp and cp -R from the snapshot directory and nothing broader', () => {
    expect(referenceCopyRules([TOKENS])).toEqual([`Bash(cp ${TOKENS.path}/*)`, `Bash(cp -R ${TOKENS.path}/*)`]);
  });

  it('renders two rules per reference, in order, and none without a reference', () => {
    expect(referenceCopyRules([TOKENS, ICONS])).toHaveLength(4);
    expect(referenceCopyRules([TOKENS, ICONS])[2]).toBe(`Bash(cp ${ICONS.path}/*)`);
    expect(referenceCopyRules([])).toEqual([]);
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
