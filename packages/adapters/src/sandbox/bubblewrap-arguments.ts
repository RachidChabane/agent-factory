import { posix } from 'node:path';
import { assertSafeSandboxPath, UnsafeSandboxPathError } from './unsafe-sandbox-path.ts';

export interface BubblewrapPolicy {
  readonly workingDirectory: string;
  readonly writableDirectories: readonly string[];
  readonly hiddenDirectories: readonly string[];
  readonly hiddenFiles: readonly string[];
  readonly network: boolean;
}

export const BUBBLEWRAP_EXECUTABLE = 'bwrap';
export const COMMAND_SEPARATOR = '--';
export const NULL_DEVICE = '/dev/null';

const ROOT_DIRECTORY = '/';
const ISOLATION_OPTIONS: readonly string[] = ['--die-with-parent', '--new-session', '--unshare-pid', '--unshare-ipc', '--unshare-uts'];
const NETWORK_ISOLATION_OPTION = '--unshare-net';
const READ_ONLY_ROOT: readonly string[] = ['--ro-bind', ROOT_DIRECTORY, ROOT_DIRECTORY];
const DEVICE_FILESYSTEM: readonly string[] = ['--dev', '/dev'];
const PROCESS_FILESYSTEM: readonly string[] = ['--proc', '/proc'];
const BIND_OPTION = '--bind';
const BIND_IF_PRESENT_OPTION = '--bind-try';
const READ_ONLY_BIND_OPTION = '--ro-bind';
const MEMORY_FILESYSTEM_OPTION = '--tmpfs';
const CHANGE_DIRECTORY_OPTION = '--chdir';

function mountPoint(path: string): string {
  assertSafeSandboxPath(path);
  if (!path.startsWith(ROOT_DIRECTORY)) throw new UnsafeSandboxPathError(path);
  return path;
}

function writableMountPoint(path: string): string {
  if (posix.normalize(mountPoint(path)) === ROOT_DIRECTORY) throw new UnsafeSandboxPathError(path);
  return path;
}

function writableBind(option: string, directory: string): readonly string[] {
  const path = writableMountPoint(directory);
  return [option, path, path];
}

export function renderBubblewrapArguments(policy: BubblewrapPolicy): readonly string[] {
  return [
    ...ISOLATION_OPTIONS,
    ...(policy.network ? [] : [NETWORK_ISOLATION_OPTION]),
    ...READ_ONLY_ROOT,
    ...DEVICE_FILESYSTEM,
    ...PROCESS_FILESYSTEM,
    ...writableBind(BIND_OPTION, policy.workingDirectory),
    ...policy.writableDirectories.flatMap((directory) => writableBind(BIND_IF_PRESENT_OPTION, directory)),
    ...policy.hiddenDirectories.flatMap((directory) => [MEMORY_FILESYSTEM_OPTION, mountPoint(directory)]),
    ...policy.hiddenFiles.flatMap((file) => [READ_ONLY_BIND_OPTION, NULL_DEVICE, mountPoint(file)]),
    CHANGE_DIRECTORY_OPTION,
    mountPoint(policy.workingDirectory),
    COMMAND_SEPARATOR,
  ];
}
