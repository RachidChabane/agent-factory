import type { PathPattern } from './path-patterns.ts';

export type BlockedPorts = () => readonly number[];

export interface CommandSandboxSettings {
  readonly deniedReads: readonly PathPattern[];
  readonly writableDirectories: readonly string[];
  readonly temporaryDirectories: readonly string[];
  readonly blockedPorts: BlockedPorts;
}
