import { describe, expect, it } from 'vitest';
import { UnsupportedPlatformError } from '../platform/supported-platform.ts';
import { BUBBLEWRAP_EXECUTABLE } from './bubblewrap-arguments.ts';
import { BubblewrapCommandSandbox } from './bubblewrap-command-sandbox.ts';
import { createCommandSandbox } from './command-sandbox-factory.ts';
import type { CommandSandboxSettings } from './command-sandbox-settings.ts';
import { SANDBOX_EXEC, SeatbeltCommandSandbox } from './seatbelt-command-sandbox.ts';

const SETTINGS: CommandSandboxSettings = { deniedReads: [], writableDirectories: [], temporaryDirectories: [], blockedPorts: () => [] };
const SCOPE = { workingDirectory: '/factory/worktrees/slot-1', network: false };

describe('createCommandSandbox', () => {
  it('confines with sandbox-exec on macOS', () => {
    const sandbox = createCommandSandbox('darwin', SETTINGS);
    expect(sandbox).toBeInstanceOf(SeatbeltCommandSandbox);
    expect(sandbox.confine(['true'], SCOPE)[0]).toBe(SANDBOX_EXEC);
  });

  it('confines with bubblewrap on Linux', () => {
    const sandbox = createCommandSandbox('linux', SETTINGS);
    expect(sandbox).toBeInstanceOf(BubblewrapCommandSandbox);
    expect(sandbox.confine(['true'], SCOPE)[0]).toBe(BUBBLEWRAP_EXECUTABLE);
  });

  it.each(['win32', 'freebsd', ''])('refuses to run commands unconfined on %j', (platform) => {
    expect(() => createCommandSandbox(platform, SETTINGS)).toThrow(UnsupportedPlatformError);
    expect(() => createCommandSandbox(platform, SETTINGS)).toThrow(JSON.stringify(platform));
  });
});
