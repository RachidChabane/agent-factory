import type { CommandSandbox } from '@agent-factory/application';
import { forPlatform, type PlatformTable } from '../platform/supported-platform.ts';
import { BubblewrapCommandSandbox } from './bubblewrap-command-sandbox.ts';
import type { CommandSandboxSettings } from './command-sandbox-settings.ts';
import { SeatbeltCommandSandbox } from './seatbelt-command-sandbox.ts';

const COMMAND_SANDBOXES: PlatformTable<(settings: CommandSandboxSettings) => CommandSandbox> = {
  darwin: (settings) => new SeatbeltCommandSandbox(settings),
  linux: (settings) => new BubblewrapCommandSandbox(settings),
};

export function createCommandSandbox(platform: string, settings: CommandSandboxSettings): CommandSandbox {
  return forPlatform(COMMAND_SANDBOXES, platform)(settings);
}
