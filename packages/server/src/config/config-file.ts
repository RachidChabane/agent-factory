import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { Clock } from '@agent-factory/application';

export const CONFIG_BACKUPS_DIRECTORY = 'config-backups';

export function configBackupsDirectory(stateDirectory: string): string {
  return join(stateDirectory, CONFIG_BACKUPS_DIRECTORY);
}
const UTF8 = 'utf8';
const TEMPORARY_SUFFIX = '.tmp';
const BACKUP_PREFIX = 'config-';
const BACKUP_EXTENSION = '.yaml';
const UNIQUE_SUFFIX_LENGTH = 8;
const FILE_PERMISSION_BITS = 0o777;
const TIMESTAMP_SEPARATORS = /[:.]/g;
const SAFE_SEPARATOR = '-';

export class ConfigFile {
  private readonly path: string;
  private readonly backupsDirectory: string;
  private readonly clock: Clock;

  constructor(path: string, backupsDirectory: string, clock: Clock) {
    this.path = path;
    this.backupsDirectory = backupsDirectory;
    this.clock = clock;
  }

  read(): Promise<string> {
    return readFile(this.path, UTF8);
  }

  async replace(text: string): Promise<string> {
    const mode = (await stat(this.path)).mode & FILE_PERMISSION_BITS;
    await mkdir(this.backupsDirectory, { recursive: true });
    const stamp = this.clock.now().toISOString().replace(TIMESTAMP_SEPARATORS, SAFE_SEPARATOR);
    const backupPath = join(this.backupsDirectory, `${BACKUP_PREFIX}${stamp}-${randomUUID().slice(0, UNIQUE_SUFFIX_LENGTH)}${BACKUP_EXTENSION}`);
    await copyFile(this.path, backupPath, constants.COPYFILE_EXCL);
    const temporary = join(dirname(this.path), `.${basename(this.path)}.${randomUUID()}${TEMPORARY_SUFFIX}`);
    try {
      const handle = await open(temporary, 'wx', mode);
      try {
        await handle.writeFile(text, UTF8);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return backupPath;
  }
}
