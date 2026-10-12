import type { CommandRunner, ResourceGuard } from '@agent-factory/application';
import { forPlatform, type PlatformTable } from '../platform/supported-platform.ts';
import { LinuxResourceGuard } from './linuxResourceGuard.ts';
import { MacosResourceGuard } from './macosResourceGuard.ts';
import { NodeProcFileReader } from './procFileReader.ts';

type ResourceGuardFactory = (runner: CommandRunner, environment: Readonly<Record<string, string>>) => ResourceGuard;

const RESOURCE_GUARDS: PlatformTable<ResourceGuardFactory> = {
  darwin: (runner, environment) => new MacosResourceGuard(runner, environment),
  linux: () => new LinuxResourceGuard(new NodeProcFileReader()),
};

export function createResourceGuard(platform: string, runner: CommandRunner, environment: Readonly<Record<string, string>>): ResourceGuard {
  return forPlatform(RESOURCE_GUARDS, platform)(runner, environment);
}
