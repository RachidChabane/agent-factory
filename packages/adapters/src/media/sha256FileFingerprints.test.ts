import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Sha256FileFingerprints } from './sha256FileFingerprints.ts';

const SHA256_OF_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('Sha256FileFingerprints', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'fingerprints-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('is the SHA-256 of the bytes of the file', async () => {
    await writeFile(join(directory, 'a.bin'), 'abc');
    expect(await new Sha256FileFingerprints().of(join(directory, 'a.bin'))).toBe(SHA256_OF_ABC);
  });

  it('is the same for two files with the same bytes, whatever their names, and differs when a byte does', async () => {
    await writeFile(join(directory, 'one.mp4'), 'same bytes');
    await writeFile(join(directory, 'two.mp4'), 'same bytes');
    await writeFile(join(directory, 'three.mp4'), 'same bytez');
    const fingerprints = new Sha256FileFingerprints();
    const [one, two, three] = await Promise.all(['one.mp4', 'two.mp4', 'three.mp4'].map((name) => fingerprints.of(join(directory, name))));
    expect(one).toBe(two);
    expect(one).not.toBe(three);
  });

  it('rejects when the file does not exist', async () => {
    await expect(new Sha256FileFingerprints().of(join(directory, 'gone.mp4'))).rejects.toThrow('ENOENT');
  });
});
