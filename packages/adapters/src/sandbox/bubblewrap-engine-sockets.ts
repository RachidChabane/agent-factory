import { lstatSync, realpathSync } from 'node:fs';
import type { EngineSocketMount } from './bubblewrap-arguments.ts';
import { isBeneath } from './bubblewrap-hidden-paths.ts';

function isSymbolicLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function linkTarget(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/** True when the path reaches its file through a link: the entry itself, or a directory above it such as `/var/run`. */
function isReachedThroughLink(path: string): boolean {
  if (isSymbolicLink(path)) return true;
  const target = linkTarget(path);
  return target !== null && target !== path;
}

/**
 * Where each granted engine socket is bound. A socket is bound on itself. A path that reaches a socket through a
 * link is never a mount point, because bubblewrap resolves an absolute link against its own staging root while it
 * mounts: a link the command sees leads to its target, which is granted and bound on itself, and a link beneath a
 * hidden directory, which the command cannot see, gets its target bound in its place. A link that leads nowhere is
 * left out.
 */
export function engineSocketMounts(sockets: readonly string[], hiddenDirectories: readonly string[]): readonly EngineSocketMount[] {
  return sockets.flatMap((socket): readonly EngineSocketMount[] => {
    if (!isReachedThroughLink(socket)) return [{ source: socket, destination: socket }];
    if (!hiddenDirectories.some((directory) => isBeneath(socket, directory))) return [];
    const target = linkTarget(socket);
    return target === null ? [] : [{ source: target, destination: socket }];
  });
}
