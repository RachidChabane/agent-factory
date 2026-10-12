import type { EngineSockets } from './container-engine-sockets.ts';
import type { PathPattern } from './path-patterns.ts';

export type BlockedPorts = () => readonly number[];

export interface CommandSandboxSettings {
  readonly deniedReads: readonly PathPattern[];
  readonly writableDirectories: readonly string[];
  readonly temporaryDirectories: readonly string[];
  readonly blockedPorts: BlockedPorts;
  /** The container engine sockets confined commands may connect to; none unless the project grants the engine. */
  readonly engineSockets?: EngineSockets;
  /**
   * Directories confined commands may read and never write, such as the reference snapshots of a project: readable inside a
   * denied directory, read-only inside a writable one. A directory that does not exist yet is granted as soon as it does.
   */
  readonly readOnlyDirectories?: readonly string[];
}
