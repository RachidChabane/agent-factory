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
}
