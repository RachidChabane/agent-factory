import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import type { CommandSandbox, SandboxScope } from '@agent-factory/application';
import { KEYCHAIN_EXECUTABLE, KEYCHAIN_SERVICES } from './credential-paths.ts';
import type { PathPattern } from './path-patterns.ts';
import { renderSeatbeltProfile, type SeatbeltPolicy } from './seatbelt-profile.ts';

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
export const INLINE_PROFILE_FLAG = '-p';
export const SHARED_TEMPORARY_DIRECTORIES: readonly string[] = ['/private/tmp', '/private/var/tmp'];

export type BlockedPorts = () => readonly number[];

export interface SeatbeltSandboxSettings {
  readonly deniedReads: readonly PathPattern[];
  readonly writableDirectories: readonly string[];
  readonly temporaryDirectories: readonly string[];
  readonly blockedPorts: BlockedPorts;
}

export function canonicalDirectory(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function userTemporaryDirectories(): readonly string[] {
  const own = canonicalDirectory(tmpdir());
  return [...new Set([own, dirname(own), ...SHARED_TEMPORARY_DIRECTORIES])];
}

export class SeatbeltCommandSandbox implements CommandSandbox {
  private readonly settings: SeatbeltSandboxSettings;

  constructor(settings: SeatbeltSandboxSettings) {
    this.settings = {
      deniedReads: settings.deniedReads,
      writableDirectories: settings.writableDirectories.map(canonicalDirectory),
      temporaryDirectories: settings.temporaryDirectories.map(canonicalDirectory),
      blockedPorts: settings.blockedPorts,
    };
  }

  policy(scope: SandboxScope): SeatbeltPolicy {
    const worktree = canonicalDirectory(scope.workingDirectory);
    return {
      deniedReads: this.settings.deniedReads,
      writableDirectories: [...new Set([worktree, ...this.settings.temporaryDirectories, ...this.settings.writableDirectories])],
      socketDirectories: [...new Set([worktree, ...this.settings.temporaryDirectories])],
      deniedExecutables: [KEYCHAIN_EXECUTABLE],
      deniedServices: KEYCHAIN_SERVICES,
      blockedPorts: this.settings.blockedPorts(),
      network: scope.network,
    };
  }

  confine(command: readonly string[], scope: SandboxScope): readonly string[] {
    return [SANDBOX_EXEC, INLINE_PROFILE_FLAG, renderSeatbeltProfile(this.policy(scope)), ...command];
  }
}
