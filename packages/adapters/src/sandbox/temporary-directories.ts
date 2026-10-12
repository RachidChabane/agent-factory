import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { forPlatform, type PlatformTable } from '../platform/supported-platform.ts';
import { canonicalDirectory } from './canonical-directory.ts';

interface TemporaryDirectoryLayout {
  readonly sharedDirectories: readonly string[];
  readonly includesParentOfOwnDirectory: boolean;
}

const TEMPORARY_DIRECTORY_LAYOUTS: PlatformTable<TemporaryDirectoryLayout> = {
  darwin: { sharedDirectories: ['/private/tmp', '/private/var/tmp'], includesParentOfOwnDirectory: true },
  linux: { sharedDirectories: ['/tmp', '/var/tmp'], includesParentOfOwnDirectory: false },
};

export function userTemporaryDirectories(platform: string = process.platform): readonly string[] {
  const layout = forPlatform(TEMPORARY_DIRECTORY_LAYOUTS, platform);
  const own = canonicalDirectory(tmpdir());
  const parent = layout.includesParentOfOwnDirectory ? [dirname(own)] : [];
  return [...new Set([own, ...parent, ...layout.sharedDirectories])];
}
