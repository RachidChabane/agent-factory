import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { engineSocketMounts } from './bubblewrap-engine-sockets.ts';

describe('engineSocketMounts', () => {
  let root: string;
  let engineHome: string;
  let socket: string;
  let visibleLink: string;
  let hiddenLink: string;
  let danglingLink: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'engine-mounts-')));
    engineHome = join(root, 'engine-home');
    await Promise.all([mkdir(join(engineHome, 'run'), { recursive: true }), mkdir(join(root, 'run'))]);
    socket = join(engineHome, 'run', 'engine.sock');
    await writeFile(socket, '');
    visibleLink = join(root, 'run', 'engine.sock');
    hiddenLink = join(engineHome, 'engine.sock');
    danglingLink = join(engineHome, 'stopped.sock');
    await Promise.all([symlink(socket, visibleLink), symlink(socket, hiddenLink), symlink(join(root, 'absent.sock'), danglingLink)]);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('binds a socket on itself', () => {
    expect(engineSocketMounts([socket], [engineHome])).toEqual([{ source: socket, destination: socket }]);
  });

  it('binds a socket that is not there yet on itself, for bubblewrap to skip while it is absent', () => {
    const later = join(root, 'run', 'later.sock');
    expect(engineSocketMounts([later], [])).toEqual([{ source: later, destination: later }]);
  });

  it('mounts nothing on a link the command sees, which leads to its granted target', () => {
    expect(engineSocketMounts([visibleLink, socket], [engineHome])).toEqual([{ source: socket, destination: socket }]);
  });

  it('binds the target of a link beneath a hidden directory in the place of the link', () => {
    expect(engineSocketMounts([hiddenLink], [engineHome])).toEqual([{ source: socket, destination: hiddenLink }]);
  });

  it('leaves out a hidden link that leads nowhere', () => {
    expect(engineSocketMounts([danglingLink], [engineHome])).toEqual([]);
  });
});
