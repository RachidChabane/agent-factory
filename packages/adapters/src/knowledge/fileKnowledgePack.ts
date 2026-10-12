import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KnowledgePack } from '@agent-factory/application';

const KNOWLEDGE_FILE_EXTENSION = '.md';
const FILE_HEADING_PREFIX = '## ';
const SECTION_SEPARATOR = '\n\n';
const UTF8 = 'utf8';
const MISSING_DIRECTORY_CODES: readonly string[] = ['ENOENT', 'ENOTDIR'];

function isMissingDirectory(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && MISSING_DIRECTORY_CODES.includes(error.code);
}

export class FileKnowledgePack implements KnowledgePack {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async read(): Promise<string> {
    const names = await this.markdownFileNames();
    const sections = await Promise.all(names.map((name) => this.section(name)));
    return sections.join(SECTION_SEPARATOR);
  }

  private async markdownFileNames(): Promise<readonly string[]> {
    try {
      const entries = await readdir(this.directory, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(KNOWLEDGE_FILE_EXTENSION))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if (isMissingDirectory(error)) return [];
      throw error;
    }
  }

  private async section(name: string): Promise<string> {
    const content = await readFile(join(this.directory, name), UTF8);
    return `${FILE_HEADING_PREFIX}${name}${SECTION_SEPARATOR}${content.trim()}`;
  }
}
