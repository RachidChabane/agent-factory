import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { forPlatform, type PlatformTable } from '../platform/supported-platform.ts';
import { HOME_PREFIX } from './credential-paths.ts';

/** The variable a Docker client reads its engine endpoint from. */
export const ENGINE_HOST_VARIABLE = 'DOCKER_HOST';
export const RUNTIME_DIRECTORY_VARIABLE = 'XDG_RUNTIME_DIR';
const UNIX_SCHEME = 'unix://';
const RUNTIME_PREFIX = '$runtime/';

/** Where the Docker-compatible container engines of each platform listen; `$runtime/` is the user's runtime directory. */
export const CONTAINER_ENGINE_SOCKETS: PlatformTable<readonly string[]> = {
  darwin: [
    '/var/run/docker.sock',
    '~/.docker/run/docker.sock',
    '~/.colima/default/docker.sock',
    '~/.orbstack/run/docker.sock',
    '~/.rd/docker.sock',
    '~/.local/share/containers/podman/machine/podman.sock',
  ],
  linux: ['/var/run/docker.sock', '/run/docker.sock', '/run/podman/podman.sock', '$runtime/docker.sock', '$runtime/podman/podman.sock'],
};

export interface EngineSocketSources {
  readonly platform: string;
  readonly home: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

/** The engine sockets a confined command is granted, read again for every command: an engine started later is found. */
export type EngineSockets = () => readonly string[];

export const NO_ENGINE_SOCKETS: EngineSockets = () => [];

function expanded(candidate: string, sources: EngineSocketSources): string | null {
  if (candidate.startsWith(HOME_PREFIX)) return join(sources.home, candidate.slice(HOME_PREFIX.length));
  if (!candidate.startsWith(RUNTIME_PREFIX)) return candidate;
  const runtime = sources.environment[RUNTIME_DIRECTORY_VARIABLE];
  return runtime === undefined || runtime === '' ? null : join(runtime, candidate.slice(RUNTIME_PREFIX.length));
}

function declaredEndpoint(environment: EngineSocketSources['environment']): string | null {
  const host = environment[ENGINE_HOST_VARIABLE];
  return host?.startsWith(UNIX_SCHEME) === true ? host.slice(UNIX_SCHEME.length) : null;
}

function present(path: string): readonly string[] {
  try {
    const target = realpathSync(path);
    return target === path ? [path] : [path, target];
  } catch {
    return [];
  }
}

/** The engine sockets present on the machine, each with the file its links lead to. */
export function containerEngineSockets(sources: EngineSocketSources): readonly string[] {
  const candidates = [...forPlatform(CONTAINER_ENGINE_SOCKETS, sources.platform).map((candidate) => expanded(candidate, sources)), declaredEndpoint(sources.environment)];
  return [...new Set(candidates.filter((candidate): candidate is string => candidate !== null).flatMap(present))];
}

export function engineSocketsOf(sources: EngineSocketSources): EngineSockets {
  return () => containerEngineSockets(sources);
}
