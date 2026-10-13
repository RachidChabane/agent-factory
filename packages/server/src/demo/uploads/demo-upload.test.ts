import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_UPLOAD_COMMAND_MAIN } from '../demo-paths.ts';
import { parseUploadArguments, UploadArgumentError, uploadToDirectory } from './demo-upload.ts';

const run = promisify(execFile);

describe('the upload command of the demonstration', () => {
  let work = '';

  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), 'demo-upload-'));
  });
  afterEach(async () => {
    await rm(work, { recursive: true, force: true });
  });

  async function fileWith(name: string, content: string): Promise<string> {
    const path = join(work, name);
    await writeFile(path, content);
    return path;
  }

  it('copies the file into the directory it is given, creating it, and answers the file address of the copy', async () => {
    const source = await fileWith('film.mp4', 'a film');
    const address = await uploadToDirectory({ directory: join(work, 'uploads'), file: source });
    expect(address.startsWith('file://')).toBe(true);
    expect(await readFile(fileURLToPath(address), 'utf8')).toBe('a film');
    expect(fileURLToPath(address).startsWith(join(work, 'uploads'))).toBe(true);
    expect(fileURLToPath(address)).toMatch(/[0-9a-f]{12}-film\.mp4$/);
  });

  it('keeps two contents of the same file name apart, and gives the same address to the same content wherever it comes from', async () => {
    const directory = join(work, 'uploads');
    const before = await fileWith('film.mp4', 'before the change');
    await mkdir(join(work, 'after'));
    const after = await fileWith('after/film.mp4', 'after the change');
    await mkdir(join(work, 'again'));
    const again = await fileWith('again/film.mp4', 'after the change');
    const addresses = [await uploadToDirectory({ directory, file: before }), await uploadToDirectory({ directory, file: after }), await uploadToDirectory({ directory, file: again })];
    expect(addresses[0]).not.toBe(addresses[1]);
    expect(addresses[2]).toBe(addresses[1]);
    expect(await readdir(directory)).toHaveLength(2);
  });

  it('refuses a file that does not exist', async () => {
    await expect(uploadToDirectory({ directory: join(work, 'uploads'), file: join(work, 'gone.mp4') })).rejects.toThrow('ENOENT');
  });

  it('wants both options and no other', () => {
    expect(parseUploadArguments(['--to', '/uploads', '--file', '/cache/a.png'])).toEqual({ directory: '/uploads', file: '/cache/a.png' });
    expect(() => parseUploadArguments(['--file', '/cache/a.png'])).toThrow(UploadArgumentError);
    expect(() => parseUploadArguments(['--to', '/uploads'])).toThrow('--file is required');
    expect(() => parseUploadArguments(['--to', '/uploads', '--file'])).toThrow('--file needs a value');
    expect(() => parseUploadArguments(['--bucket', 'x'])).toThrow('--bucket is not an option of this command');
  });

  it('prints the address as the last line when run as a command, and fails with its reason otherwise', async () => {
    const source = await fileWith('shot.png', 'pixels');
    const printed = await run(process.execPath, [DEMO_UPLOAD_COMMAND_MAIN, '--to', join(work, 'uploads'), '--file', source]);
    const address = printed.stdout.trim().split('\n').at(-1) ?? '';
    expect(address.startsWith('file://')).toBe(true);
    expect(await readFile(fileURLToPath(address), 'utf8')).toBe('pixels');
    await expect(run(process.execPath, [DEMO_UPLOAD_COMMAND_MAIN, '--to', join(work, 'uploads'), '--file', join(work, 'gone.png')])).rejects.toMatchObject({ code: 1 });
  });
});
