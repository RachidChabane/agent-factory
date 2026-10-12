import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { describe, expect, it } from 'vitest';
import { UnsupportedPlatformError } from '../platform/supported-platform.ts';
import { LinuxResourceGuard } from './linuxResourceGuard.ts';
import { MacosResourceGuard } from './macosResourceGuard.ts';
import { createResourceGuard } from './resourceGuardFactory.ts';

class UnusedRunner implements CommandRunner {
  run(): Promise<CommandResult> {
    return Promise.reject(new Error('the factory must not run anything'));
  }
}

describe('createResourceGuard', () => {
  it('reads the memory with the macOS tools on macOS', () => {
    expect(createResourceGuard('darwin', new UnusedRunner(), {})).toBeInstanceOf(MacosResourceGuard);
  });

  it('reads /proc on Linux', () => {
    expect(createResourceGuard('linux', new UnusedRunner(), {})).toBeInstanceOf(LinuxResourceGuard);
  });

  it.each(['win32', 'openbsd', ''])('names the platform it cannot guard: %j', (platform) => {
    expect(() => createResourceGuard(platform, new UnusedRunner(), {})).toThrow(UnsupportedPlatformError);
    expect(() => createResourceGuard(platform, new UnusedRunner(), {})).toThrow(JSON.stringify(platform));
  });
});
