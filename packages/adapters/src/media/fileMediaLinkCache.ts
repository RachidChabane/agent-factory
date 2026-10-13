import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { MediaLinkCache } from '@agent-factory/application';
import { z } from 'zod';

export const MEDIA_LINKS_FILE = 'media-links.json';
const UTF8 = 'utf8';
const MISSING_FILE_CODE = 'ENOENT';
const JSON_INDENT = 2;
const TEMPORARY_SUFFIX = '.tmp';

const LinksSchema = z.record(z.string(), z.string());

/**
 * The links of the files already uploaded, kept by the fingerprint of their content in one file of the installation's
 * state directory. A file that cannot be read back is an empty cache: the files are uploaded again, nothing else is lost.
 */
export class FileMediaLinkCache implements MediaLinkCache {
  private readonly path: string;
  private links: Map<string, string> | null = null;

  constructor(stateDirectory: string) {
    this.path = join(stateDirectory, MEDIA_LINKS_FILE);
  }

  async find(fingerprint: string): Promise<string | null> {
    return (await this.loaded()).get(fingerprint) ?? null;
  }

  async remember(fingerprint: string, url: string): Promise<void> {
    const links = await this.loaded();
    links.set(fingerprint, url);
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}${TEMPORARY_SUFFIX}`;
    await writeFile(temporary, `${JSON.stringify(Object.fromEntries(links), null, JSON_INDENT)}\n`);
    await rename(temporary, this.path);
  }

  private async loaded(): Promise<Map<string, string>> {
    this.links ??= await this.read();
    return this.links;
  }

  private async read(): Promise<Map<string, string>> {
    try {
      const parsed = LinksSchema.safeParse(JSON.parse(await readFile(this.path, UTF8)));
      return new Map(parsed.success ? Object.entries(parsed.data) : []);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE) return new Map();
      if (error instanceof SyntaxError) return new Map();
      throw error;
    }
  }
}
