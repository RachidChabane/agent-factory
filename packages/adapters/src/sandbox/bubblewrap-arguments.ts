import { posix } from 'node:path';
import { assertSafeSandboxPath, UnsafeSandboxPathError } from './unsafe-sandbox-path.ts';

/** A container engine socket of the host (source) and the path the confined command reaches it at (destination). */
export interface EngineSocketMount {
  readonly source: string;
  readonly destination: string;
}

export interface BubblewrapPolicy {
  readonly workingDirectory: string;
  readonly writableDirectories: readonly string[];
  readonly hiddenDirectories: readonly string[];
  readonly hiddenFiles: readonly string[];
  /** Container engine sockets bound back in after the hidden paths, so a hidden runtime directory still lets them through. */
  readonly engineSockets: readonly EngineSocketMount[];
  /** Directories mounted read-only after everything else, so neither a writable parent nor a hidden one changes what a command sees of them. */
  readonly readOnlyDirectories: readonly string[];
  readonly network: boolean;
}

export const BUBBLEWRAP_EXECUTABLE = 'bwrap';
export const COMMAND_SEPARATOR = '--';
export const NULL_DEVICE = '/dev/null';

const ROOT_DIRECTORY = '/';
const ISOLATION_OPTIONS: readonly string[] = ['--die-with-parent', '--new-session', '--unshare-pid', '--unshare-ipc', '--unshare-uts'];
const NETWORK_ISOLATION_OPTION = '--unshare-net';
const DEVICE_FILESYSTEM: readonly string[] = ['--dev', '/dev'];
const PROCESS_FILESYSTEM: readonly string[] = ['--proc', '/proc'];
const BIND_OPTION = '--bind';
const BIND_IF_PRESENT_OPTION = '--bind-try';
/**
 * Hides a file behind the null device. bubblewrap mounts every other bind without device access, where opening
 * the null device fails with "Permission denied"; through a device bind the file reads as empty, and a write
 * lands in the null device, never in the file.
 */
const DEVICE_BIND_OPTION = '--dev-bind';
const READ_ONLY_BIND_OPTION = '--ro-bind';
const READ_ONLY_ROOT: readonly string[] = [READ_ONLY_BIND_OPTION, ROOT_DIRECTORY, ROOT_DIRECTORY];
const READ_ONLY_BIND_IF_PRESENT_OPTION = '--ro-bind-try';
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
    ...policy.hiddenFiles.flatMap((file) => [DEVICE_BIND_OPTION, NULL_DEVICE, mountPoint(file)]),
    ...policy.engineSockets.flatMap((socket) => [BIND_IF_PRESENT_OPTION, mountPoint(socket.source), mountPoint(socket.destination)]),
    ...policy.readOnlyDirectories.flatMap((directory) => [READ_ONLY_BIND_IF_PRESENT_OPTION, mountPoint(directory), mountPoint(directory)]),
    CHANGE_DIRECTORY_OPTION,
    mountPoint(policy.workingDirectory),
    COMMAND_SEPARATOR,
  ];
}
