import type { PathPattern } from './path-patterns.ts';

export interface SeatbeltPolicy {
  readonly deniedReads: readonly PathPattern[];
  readonly writableDirectories: readonly string[];
  readonly socketDirectories: readonly string[];
  readonly deniedExecutables: readonly string[];
  readonly deniedServices: readonly string[];
  readonly blockedPorts: readonly number[];
  readonly network: boolean;
}

export class UnsafeSandboxPathError extends Error {
  constructor(path: string) {
    super(`${JSON.stringify(path)} cannot be written into a sandbox profile`);
    this.name = 'UnsafeSandboxPathError';
  }
}

export class UnsafeSandboxPortError extends Error {
  constructor(port: number) {
    super(`${port} is not a TCP port that can be written into a sandbox profile`);
    this.name = 'UnsafeSandboxPortError';
  }
}

export const SEATBELT_VERSION = '(version 1)';
export const NAME_SERVICE_SOCKET = '/private/var/run/mDNSResponder';
export const LAUNCHD_SOCKET_DIRECTORIES = ['/private/var/run/com.apple.launchd.', '/private/tmp/com.apple.launchd.'] as const;

const WRITABLE_DEVICES: readonly string[] = ['/dev/null', '/dev/zero', '/dev/tty', '/dev/dtracehelper', '/dev/ptmx', '/dev/random', '/dev/urandom'];
const WRITABLE_DEVICE_PATTERNS: readonly string[] = ['^/dev/fd/', '^/dev/ttys[0-9]+$', '^/dev/pty'];
const UNSAFE_CHARACTERS = /["\n\r\\]/;
const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\/]/g;
const NEWLINE = '\n';
const INDENT = '\n  ';

function quoted(path: string): string {
  if (UNSAFE_CHARACTERS.test(path)) throw new UnsafeSandboxPathError(path);
  return `"${path}"`;
}

function prefixRegex(path: string): string {
  if (UNSAFE_CHARACTERS.test(path)) throw new UnsafeSandboxPathError(path);
  return `#"^${path.replace(REGEX_METACHARACTERS, '\\$&')}"`;
}

function pathFilter(pattern: PathPattern): string {
  return pattern.prefix ? `(regex ${prefixRegex(pattern.path)})` : `(subpath ${quoted(pattern.path)})`;
}

const LOOPBACK_REACH = '(remote ip "localhost:*")';
const INTERNET_REACH = '(remote ip "*:*")';
const MIN_PORT = 1;
const MAX_PORT = 65_535;

function blockedPortFilter(port: number): string {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) throw new UnsafeSandboxPortError(port);
  return `(remote ip "*:${port}")`;
}

function denyOutsideReach(reach: string, sockets: readonly string[]): readonly string[] {
  const outsideSockets = sockets.length === 0 ? [] : [`(require-not (require-any ${sockets.join(' ')}))`];
  return [`(deny network-outbound (require-all ${[`(require-not ${reach})`, ...outsideSockets].join(' ')}))`];
}

function rule(effect: 'allow' | 'deny', operation: string, filters: readonly string[]): readonly string[] {
  return filters.length === 0 ? [] : [`(${effect} ${operation}${INDENT}${filters.join(INDENT)})`];
}

export function renderSeatbeltProfile(policy: SeatbeltPolicy): string {
  const writable = [
    ...policy.writableDirectories.map((directory) => `(subpath ${quoted(directory)})`),
    ...WRITABLE_DEVICES.map((device) => `(literal ${quoted(device)})`),
    ...WRITABLE_DEVICE_PATTERNS.map((pattern) => `(regex #"${pattern}")`),
  ];
  const sockets = policy.socketDirectories.map((directory) => `(remote unix-socket (subpath ${quoted(directory)}))`);
  const nameService = policy.network ? [`(remote unix-socket (literal ${quoted(NAME_SERVICE_SOCKET)}))`] : [];
  const reachableSockets = [...sockets, ...nameService];
  const launchdSockets = LAUNCHD_SOCKET_DIRECTORIES.map((prefix) => `(remote unix-socket (regex ${prefixRegex(prefix)}))`);
  return [
    SEATBELT_VERSION,
    '(allow default)',
    ...rule('deny', 'file-read*', policy.deniedReads.map(pathFilter)),
    '(deny file-write*)',
    ...rule('allow', 'file-write*', writable),
    ...rule('deny', 'file-write*', policy.deniedReads.map(pathFilter)),
    ...rule('deny', 'mach-lookup', policy.deniedServices.map((service) => `(global-name ${quoted(service)})`)),
    ...rule('deny', 'process-exec', policy.deniedExecutables.map((executable) => `(literal ${quoted(executable)})`)),
    ...denyOutsideReach(policy.network ? INTERNET_REACH : LOOPBACK_REACH, reachableSockets),
    ...rule('deny', 'network-outbound', policy.blockedPorts.map(blockedPortFilter)),
    ...rule('deny', 'network-outbound', launchdSockets),
  ].join(NEWLINE);
}
