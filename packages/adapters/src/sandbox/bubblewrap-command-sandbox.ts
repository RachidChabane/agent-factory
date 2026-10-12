import { homedir } from 'node:os';
import type { CommandSandbox, SandboxScope } from '@agent-factory/application';
import { BUBBLEWRAP_EXECUTABLE, renderBubblewrapArguments, type BubblewrapPolicy } from './bubblewrap-arguments.ts';
import { hiddenPaths } from './bubblewrap-hidden-paths.ts';
import { canonicalDirectory } from './canonical-directory.ts';
import type { CommandSandboxSettings } from './command-sandbox-settings.ts';
import { NO_ENGINE_SOCKETS } from './container-engine-sockets.ts';
import { LINUX_PRIVATE_RUNTIME_PATHS } from './credential-paths.ts';
import { parsePathPattern, type PathPattern } from './path-patterns.ts';

/**
 * Confines a command with bubblewrap: read-only root, writable worktree, temporary and configured
 * directories, credential stores and the host's agent and container sockets hidden, and a private
 * network namespace (loopback only) unless the scope grants the network or shares the host's loopback with
 * the services of a stack, which on Linux means sharing the host's network. The container engine sockets
 * the settings grant are bound back in, whatever hides their directory.
 *
 * A configured or temporary directory that does not exist when the command starts is not bound.
 *
 * Not expressible: blocking only some loopback ports while the network is shared (a command granted
 * the network reaches every port of the host, the factory's own included, and the abstract Unix
 * sockets of the host), and denying the execution of single binaries.
 */
export class BubblewrapCommandSandbox implements CommandSandbox {
  private readonly settings: CommandSandboxSettings;
  private readonly privateRuntimePaths: readonly PathPattern[];

  constructor(settings: CommandSandboxSettings, privateRuntimePaths: readonly string[] = LINUX_PRIVATE_RUNTIME_PATHS) {
    this.settings = settings;
    this.privateRuntimePaths = privateRuntimePaths.map((pattern) => parsePathPattern(pattern, homedir()));
  }

  policy(scope: SandboxScope): BubblewrapPolicy {
    const worktree = canonicalDirectory(scope.workingDirectory);
    const shared = [...this.settings.temporaryDirectories, ...this.settings.writableDirectories].map(canonicalDirectory);
    const hidden = hiddenPaths(this.settings.deniedReads, this.privateRuntimePaths);
    return {
      workingDirectory: worktree,
      writableDirectories: [...new Set(shared)].filter((directory) => directory !== worktree),
      hiddenDirectories: hidden.directories,
      hiddenFiles: hidden.files,
      engineSockets: (this.settings.engineSockets ?? NO_ENGINE_SOCKETS)(),
      network: scope.network || scope.hostLoopback === true,
    };
  }

  confine(command: readonly string[], scope: SandboxScope): readonly string[] {
    return [BUBBLEWRAP_EXECUTABLE, ...renderBubblewrapArguments(this.policy(scope)), ...command];
  }
}
