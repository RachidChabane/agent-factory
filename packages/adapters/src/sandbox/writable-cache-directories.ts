import { forPlatform, type PlatformTable } from '../platform/supported-platform.ts';

const PORTABLE_CACHE_DIRECTORIES: readonly string[] = [
  '~/.npm',
  '~/.yarn/berry',
  '~/.cache/uv',
  '~/.local/state/mise',
  '~/.cargo/registry',
  '~/.cargo/git',
  '~/go/pkg/mod',
];

const DARWIN_CACHE_DIRECTORIES: readonly string[] = [
  '~/Library/pnpm/store',
  '~/Library/Caches/pnpm',
  '~/Library/Caches/Yarn',
  '~/Library/Caches/pip',
  '~/Library/Caches/mise',
  '~/Library/Caches/node-gyp',
  '~/Library/Caches/go-build',
];

const LINUX_CACHE_DIRECTORIES: readonly string[] = [
  '~/.local/share/pnpm/store',
  '~/.local/state/pnpm',
  '~/.cache/pnpm',
  '~/.cache/yarn',
  '~/.cache/pip',
  '~/.cache/mise',
  '~/.cache/node-gyp',
  '~/.cache/go-build',
];

const WRITABLE_CACHE_DIRECTORIES: PlatformTable<readonly string[]> = {
  darwin: [...PORTABLE_CACHE_DIRECTORIES, ...DARWIN_CACHE_DIRECTORIES],
  linux: [...PORTABLE_CACHE_DIRECTORIES, ...LINUX_CACHE_DIRECTORIES],
};

export function defaultWritableCacheDirectories(platform: string): readonly string[] {
  return forPlatform(WRITABLE_CACHE_DIRECTORIES, platform);
}
