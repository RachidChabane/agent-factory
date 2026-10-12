import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileMediaLinkCache, MEDIA_LINKS_FILE } from './fileMediaLinkCache.ts';

describe('FileMediaLinkCache', () => {
  let state = '';

  beforeEach(async () => {
    state = await mkdtemp(join(tmpdir(), 'media-links-'));
  });
  afterEach(async () => {
    await rm(state, { recursive: true, force: true });
  });

  it('knows no link before one is kept', async () => {
    expect(await new FileMediaLinkCache(state).find('abc')).toBeNull();
  });

  it('keeps a link by the fingerprint of the content, across instances', async () => {
    await new FileMediaLinkCache(state).remember('abc', 'https://files.example.test/abc');
    await new FileMediaLinkCache(state).remember('def', 'https://files.example.test/def');
    const reopened = new FileMediaLinkCache(state);
    expect(await reopened.find('abc')).toBe('https://files.example.test/abc');
    expect(await reopened.find('def')).toBe('https://files.example.test/def');
  });

  it('writes one readable file in the state directory and leaves no temporary file behind', async () => {
    await new FileMediaLinkCache(state).remember('abc', 'https://files.example.test/abc');
    expect(await readdir(state)).toEqual([MEDIA_LINKS_FILE]);
    expect(JSON.parse(await readFile(join(state, MEDIA_LINKS_FILE), 'utf8'))).toEqual({ abc: 'https://files.example.test/abc' });
  });

  it('creates the state directory when it does not exist yet', async () => {
    const nested = join(state, 'not', 'yet');
    await new FileMediaLinkCache(nested).remember('abc', 'https://files.example.test/abc');
    expect(await new FileMediaLinkCache(nested).find('abc')).toBe('https://files.example.test/abc');
  });

  it('starts again from nothing when the file cannot be read back', async () => {
    await writeFile(join(state, MEDIA_LINKS_FILE), '{"abc": ');
    const cache = new FileMediaLinkCache(state);
    expect(await cache.find('abc')).toBeNull();
    await cache.remember('def', 'https://files.example.test/def');
    expect(JSON.parse(await readFile(join(state, MEDIA_LINKS_FILE), 'utf8'))).toEqual({ def: 'https://files.example.test/def' });
  });

  it('starts again from nothing when the file holds something else than links', async () => {
    await writeFile(join(state, MEDIA_LINKS_FILE), '["abc"]');
    expect(await new FileMediaLinkCache(state).find('abc')).toBeNull();
  });
});
