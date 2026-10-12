import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileKnowledgePack } from './fileKnowledgePack.ts';

describe('FileKnowledgePack', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'factory-knowledge-test-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('concatenates the markdown files sorted by name, each under a heading naming it', async () => {
    await writeFile(join(directory, 'b-design.md'), 'Design rules.\n');
    await writeFile(join(directory, 'a-product.md'), '# Product\n\nWhat it is.\n');

    expect(await new FileKnowledgePack(directory).read()).toBe(
      '## a-product.md\n\n# Product\n\nWhat it is.\n\n## b-design.md\n\nDesign rules.',
    );
  });

  it('ignores files that are not markdown and nested directories', async () => {
    await writeFile(join(directory, 'notes.md'), 'Kept.');
    await writeFile(join(directory, 'image.png'), 'binary');
    await writeFile(join(directory, 'notes.md.bak'), 'backup');
    await mkdir(join(directory, 'nested.md'));
    await mkdir(join(directory, 'deep'));
    await writeFile(join(directory, 'deep', 'inner.md'), 'Not read.');

    expect(await new FileKnowledgePack(directory).read()).toBe('## notes.md\n\nKept.');
  });

  it('is empty for a directory with no markdown file', async () => {
    expect(await new FileKnowledgePack(directory).read()).toBe('');
  });

  it('is empty for a missing directory', async () => {
    expect(await new FileKnowledgePack(join(directory, 'absent')).read()).toBe('');
  });
});
