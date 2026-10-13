import { describe, expect, it } from 'vitest';
import { diffWithoutEvidence } from './diff-evidence.ts';

const textFile = (path: string): string =>
  [`diff --git a/${path} b/${path}`, 'index 1111111..2222222 100644', `--- a/${path}`, `+++ b/${path}`, '@@ -1 +1 @@', '-old', '+new'].join('\n');
const binaryFile = (path: string): string =>
  [`diff --git a/${path} b/${path}`, 'new file mode 100644', 'index 0000000..3333333', `Binary files /dev/null and b/${path} differ`].join('\n');
const rename = (from: string, to: string): string =>
  [`diff --git a/${from} b/${to}`, 'similarity index 100%', `rename from ${from}`, `rename to ${to}`].join('\n');
const joined = (...blocks: string[]): string => blocks.join('\n');

const PRODUCT = 'app/pages/mockup.vue';
const FILM_REPORT = '.evidence/42/films/checkout-flow/after-report.json';

describe('diffWithoutEvidence', () => {
  it('returns an empty diff when only evidence files changed', () => {
    expect(diffWithoutEvidence(joined(textFile(FILM_REPORT), binaryFile('.evidence/42/after/1-link.png')))).toBe('');
  });

  it('returns an empty diff for an empty diff', () => {
    expect(diffWithoutEvidence('')).toBe('');
  });

  it('keeps the files outside the evidence directory untouched', () => {
    const diff = joined(textFile(PRODUCT), textFile('README.md'));
    expect(diffWithoutEvidence(diff)).toBe(diff);
  });

  it('drops evidence files from a mixed diff and keeps the rest in order', () => {
    const diff = joined(textFile(PRODUCT), textFile(FILM_REPORT), binaryFile('.evidence/42/video.webm'), textFile('README.md'));
    expect(diffWithoutEvidence(diff)).toBe(joined(textFile(PRODUCT), textFile('README.md')));
  });

  it('drops a binary entry under the evidence directory and keeps a binary entry elsewhere', () => {
    const diff = joined(binaryFile('app/public/logo.png'), binaryFile('.evidence/42/after/1-link.png'));
    expect(diffWithoutEvidence(diff)).toBe(binaryFile('app/public/logo.png'));
  });

  it('keeps a rename out of the evidence directory', () => {
    const diff = rename('.evidence/42/notes.md', 'docs/notes.md');
    expect(diffWithoutEvidence(diff)).toBe(diff);
  });

  it('keeps a rename into the evidence directory', () => {
    const diff = rename('docs/notes.md', '.evidence/42/notes.md');
    expect(diffWithoutEvidence(diff)).toBe(diff);
  });

  it('drops a rename inside the evidence directory', () => {
    expect(diffWithoutEvidence(rename('.evidence/41/a.json', '.evidence/42/a.json'))).toBe('');
  });

  it('does not mistake look-alike paths for evidence', () => {
    const diff = joined(textFile('.evidence-notes/readme.md'), textFile('docs/.evidence/readme.md'), textFile('.evidence'));
    expect(diffWithoutEvidence(diff)).toBe(diff);
  });

  it('matches the path in the file header, not the content of the hunks', () => {
    const diff = [`diff --git a/${PRODUCT} b/${PRODUCT}`, `--- a/${PRODUCT}`, `+++ b/${PRODUCT}`, '@@ -1 +1 @@', '-diff --x', '+see .evidence/42/after.png'].join('\n');
    expect(diffWithoutEvidence(diff)).toBe(diff);
  });

  it('handles paths containing spaces and quoted paths', () => {
    const quoted = [
      'diff --git "a/.evidence/42/caf\\303\\251.png" "b/.evidence/42/caf\\303\\251.png"',
      'new file mode 100644',
      'Binary files /dev/null and "b/.evidence/42/caf\\303\\251.png" differ',
    ].join('\n');
    expect(diffWithoutEvidence(joined(textFile('.evidence/42/a b.json'), quoted, textFile('docs/a b.md')))).toBe(textFile('docs/a b.md'));
  });

  it('drops a deleted evidence file', () => {
    const deleted = ['diff --git a/.evidence/41/old.json b/.evidence/41/old.json', 'deleted file mode 100644', '--- a/.evidence/41/old.json', '+++ /dev/null', '@@ -1 +0,0 @@', '-x'].join('\n');
    expect(diffWithoutEvidence(joined(deleted, textFile(PRODUCT)))).toBe(textFile(PRODUCT));
  });

  it('keeps text that precedes the first file header', () => {
    expect(diffWithoutEvidence(joined('preamble', textFile(FILM_REPORT), textFile(PRODUCT)))).toBe(joined('preamble', textFile(PRODUCT)));
  });
});
