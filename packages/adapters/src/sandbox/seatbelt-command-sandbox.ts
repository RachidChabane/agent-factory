import type { CommandSandbox, SandboxScope } from '@agent-factory/application';
import { canonicalDirectory } from './canonical-directory.ts';
import type { CommandSandboxSettings } from './command-sandbox-settings.ts';
import { NO_ENGINE_SOCKETS } from './container-engine-sockets.ts';
import { KEYCHAIN_EXECUTABLE, KEYCHAIN_SERVICES } from './credential-paths.ts';
import { renderSeatbeltProfile, type SeatbeltPolicy } from './seatbelt-profile.ts';

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
export const INLINE_PROFILE_FLAG = '-p';

export type SeatbeltSandboxSettings = Required<CommandSandboxSettings>;

export class SeatbeltCommandSandbox implements CommandSandbox {
  private readonly settings: SeatbeltSandboxSettings;

  constructor(settings: CommandSandboxSettings) {
    this.settings = {
      deniedReads: settings.deniedReads,
      writableDirectories: settings.writableDirectories.map(canonicalDirectory),
      temporaryDirectories: settings.temporaryDirectories.map(canonicalDirectory),
      blockedPorts: settings.blockedPorts,
      engineSockets: settings.engineSockets ?? NO_ENGINE_SOCKETS,
    };
  }

  policy(scope: SandboxScope): SeatbeltPolicy {
    const worktree = canonicalDirectory(scope.workingDirectory);
    return {
      deniedReads: this.settings.deniedReads,
      writableDirectories: [...new Set([worktree, ...this.settings.temporaryDirectories, ...this.settings.writableDirectories])],
      socketDirectories: [...new Set([worktree, ...this.settings.temporaryDirectories])],
      engineSockets: this.settings.engineSockets(),
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
