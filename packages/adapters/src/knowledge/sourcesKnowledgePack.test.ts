import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkspaceFiles } from '@agent-factory/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SOURCE_UNAVAILABLE_REASONS, SourcesKnowledgePack, type KnowledgeSource } from './sourcesKnowledgePack.ts';

const OUTSIDE_SECRET = 'content that lives outside the repository';

function unavailable(heading: string, reason: string): string {
  return `## ${heading}\n\n(unavailable: ${reason})`;
}

describe('SourcesKnowledgePack', () => {
  let root: string;
  let repository: string;
  let notes: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-sources-')));
    repository = join(root, 'repository');
    notes = join(root, 'notes');
    await mkdir(join(repository, 'docs'), { recursive: true });
    await mkdir(notes);
    await writeFile(join(root, 'outside.md'), OUTSIDE_SECRET);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function pack(sources: readonly KnowledgeSource[]): SourcesKnowledgePack {
    return new SourcesKnowledgePack(sources, repository);
  }

  it('reads the sources in the order they are declared, each document under a heading naming its source', async () => {
    await writeFile(join(notes, 'product.md'), '# Product\n\nWhat it is.\n');
    await writeFile(join(repository, 'docs', 'architecture.md'), 'Layers.\n');
    await mkdir(join(notes, 'design'));
    await writeFile(join(notes, 'design', 'b-tokens.md'), 'Tokens.\n');
    await writeFile(join(notes, 'design', 'a-voice.md'), 'Voice.\n');
    const sources: readonly KnowledgeSource[] = [
      { kind: 'repository', path: 'docs/architecture.md' },
      { kind: 'path', path: join(notes, 'design') },
      { kind: 'path', path: join(notes, 'product.md') },
    ];
    expect(await pack(sources).read()).toBe(
      [
        '## docs/architecture.md (repository)\n\nLayers.',
        `## ${join(notes, 'design', 'a-voice.md')}\n\nVoice.`,
        `## ${join(notes, 'design', 'b-tokens.md')}\n\nTokens.`,
        `## ${join(notes, 'product.md')}\n\n# Product\n\nWhat it is.`,
      ].join('\n\n'),
    );
  });

  it('reads only the markdown files of a directory, and none of its subdirectories or links', async () => {
    await writeFile(join(notes, 'kept.md'), 'Kept.');
    await writeFile(join(notes, 'image.png'), 'binary');
    await writeFile(join(notes, 'kept.md.bak'), 'backup');
    await mkdir(join(notes, 'nested.md'));
    await mkdir(join(notes, 'deep'));
    await writeFile(join(notes, 'deep', 'inner.md'), 'Not read.');
    await symlink(join(root, 'outside.md'), join(notes, 'link.md'));
    expect(await pack([{ kind: 'path', path: notes }]).read()).toBe(`## ${join(notes, 'kept.md')}\n\nKept.`);
  });

  it('contributes nothing for a directory without markdown, and an empty pack for no source', async () => {
    expect(await pack([{ kind: 'path', path: notes }]).read()).toBe('');
    expect(await pack([]).read()).toBe('');
  });

  it('reads a file it is named, whatever its extension', async () => {
    await writeFile(join(notes, 'handbook.txt'), 'Plain text.\n');
    expect(await pack([{ kind: 'path', path: join(notes, 'handbook.txt') }]).read()).toBe(`## ${join(notes, 'handbook.txt')}\n\nPlain text.`);
  });

  it('reports a source that is missing instead of throwing, and keeps reading the next ones', async () => {
    await writeFile(join(repository, 'README.md'), 'Readme.');
    const missingPath = join(notes, 'absent.md');
    const sources: readonly KnowledgeSource[] = [
      { kind: 'path', path: missingPath },
      { kind: 'path', path: join(missingPath, 'below-a-missing-file') },
      { kind: 'repository', path: 'docs/absent.md' },
      { kind: 'repository', path: 'README.md' },
    ];
    expect(await pack(sources).read()).toBe(
      [
        unavailable(missingPath, SOURCE_UNAVAILABLE_REASONS.notFound),
        unavailable(join(missingPath, 'below-a-missing-file'), SOURCE_UNAVAILABLE_REASONS.notFound),
        unavailable('docs/absent.md (repository)', SOURCE_UNAVAILABLE_REASONS.notFound),
        '## README.md (repository)\n\nReadme.',
      ].join('\n\n'),
    );
  });

  it('reports a repository source that leaves the clone, and never reads what is there', async () => {
    const text = await pack([
      { kind: 'repository', path: '../outside.md' },
      { kind: 'repository', path: join(root, 'outside.md') },
    ]).read();
    expect(text).toBe(
      [
        unavailable('../outside.md (repository)', SOURCE_UNAVAILABLE_REASONS.outsideRepository),
        unavailable(`${join(root, 'outside.md')} (repository)`, SOURCE_UNAVAILABLE_REASONS.outsideRepository),
      ].join('\n\n'),
    );
    expect(text).not.toContain(OUTSIDE_SECRET);
  });

  it('does not follow a link inside the clone to a file outside it', async () => {
    await symlink(join(root, 'outside.md'), join(repository, 'docs', 'link.md'));
    const text = await pack([{ kind: 'repository', path: 'docs/link.md' }]).read();
    expect(text).toBe(unavailable('docs/link.md (repository)', SOURCE_UNAVAILABLE_REASONS.notFound));
    expect(text).not.toContain(OUTSIDE_SECRET);
  });

  it('follows a link that stays inside the clone', async () => {
    await writeFile(join(repository, 'docs', 'real.md'), 'Real.');
    await symlink(join(repository, 'docs', 'real.md'), join(repository, 'docs', 'alias.md'));
    expect(await pack([{ kind: 'repository', path: 'docs/alias.md' }]).read()).toBe('## docs/alias.md (repository)\n\nReal.');
  });

  it('reports a repository source that names a directory', async () => {
    expect(await pack([{ kind: 'repository', path: 'docs' }]).read()).toBe(unavailable('docs (repository)', SOURCE_UNAVAILABLE_REASONS.directoryInRepository));
  });

  it('reports a path that is neither a file nor a directory', async () => {
    const socketPath = join(notes, 'agent.sock');
    const server: Server = createServer();
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    try {
      expect(await pack([{ kind: 'path', path: socketPath }]).read()).toBe(unavailable(socketPath, SOURCE_UNAVAILABLE_REASONS.neitherFileNorDirectory));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('reads the sources again on every call', async () => {
    const file = join(notes, 'live.md');
    const subject = pack([{ kind: 'path', path: file }]);
    expect(await subject.read()).toBe(unavailable(file, SOURCE_UNAVAILABLE_REASONS.notFound));
    await writeFile(file, 'First.');
    expect(await subject.read()).toBe(`## ${file}\n\nFirst.`);
    await writeFile(file, 'Second.');
    expect(await subject.read()).toBe(`## ${file}\n\nSecond.`);
  });

  it('reads repository files through the workspace it is given, from the clone it is given', async () => {
    const asked: (readonly [string, string])[] = [];
    const files: WorkspaceFiles = {
      readText: (workspace, path) => {
        asked.push([workspace, path]);
        return Promise.resolve('From the workspace.');
      },
      writeText: () => Promise.reject(new Error('read only')),
      exists: () => Promise.resolve(true),
      sizeOf: () => Promise.resolve(null),
      copyFile: () => Promise.resolve(false),
      remove: () => Promise.resolve(),
      makeDirectory: () => Promise.reject(new Error('read only')),
    };
    const text = await new SourcesKnowledgePack([{ kind: 'repository', path: 'docs/context.md' }], '/clones/acme', files).read();
    expect(asked).toEqual([['/clones/acme', 'docs/context.md']]);
    expect(text).toBe('## docs/context.md (repository)\n\nFrom the workspace.');
  });
});

describe('the documents of a knowledge source', () => {
  let root: string;
  let repository: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'knowledge-documents-')));
    repository = join(root, 'repository');
    await mkdir(join(repository, 'docs'), { recursive: true });
    await writeFile(join(root, 'outside.md'), OUTSIDE_SECRET);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists the Markdown documents of a directory with their first heading as title', async () => {
    await writeFile(join(root, 'checkout.md'), '# Checkout flow\n\nThe cart becomes an order.\n');
    await writeFile(join(root, 'notes.md'), 'No heading here.\n');
    const pack = new SourcesKnowledgePack([{ kind: 'path', path: root }], root);
    expect(await pack.documents({ kind: 'path', path: root })).toEqual([
      { path: join(root, 'checkout.md'), title: 'Checkout flow', bytes: 44 },
      { path: join(root, 'notes.md'), title: 'notes.md', bytes: 17 },
      { path: join(root, 'outside.md'), title: 'outside.md', bytes: Buffer.byteLength(OUTSIDE_SECRET) },
    ]);
    await expect(pack.documents({ kind: 'path', path: join(root, 'missing') })).rejects.toThrow(SOURCE_UNAVAILABLE_REASONS.notFound);
  });

  it('lists the file a repository source names, from the clone', async () => {
    const context = '# Context\n\nWhy.\n';
    await writeFile(join(repository, 'docs', 'context.md'), context);
    const source: KnowledgeSource = { kind: 'repository', path: 'docs/context.md' };
    expect(await new SourcesKnowledgePack([source], repository).documents(source)).toEqual([{ path: 'docs/context.md', title: 'Context', bytes: Buffer.byteLength(context) }]);
  });

  it('says why a repository source cannot be listed, in the words the knowledge text uses', async () => {
    const reasons: readonly (readonly [KnowledgeSource, string])[] = [
      [{ kind: 'repository', path: 'docs' }, SOURCE_UNAVAILABLE_REASONS.directoryInRepository],
      [{ kind: 'repository', path: 'docs/absent.md' }, SOURCE_UNAVAILABLE_REASONS.notFound],
      [{ kind: 'repository', path: '../outside.md' }, SOURCE_UNAVAILABLE_REASONS.outsideRepository],
    ];
    for (const [source, reason] of reasons) {
      await expect(new SourcesKnowledgePack([source], repository).documents(source)).rejects.toThrow(new Error(reason));
    }
  });

  it('does not list the text of a file outside the clone', async () => {
    const source: KnowledgeSource = { kind: 'repository', path: join(root, 'outside.md') };
    await expect(new SourcesKnowledgePack([source], repository).documents(source)).rejects.toThrow(SOURCE_UNAVAILABLE_REASONS.outsideRepository);
  });
});
