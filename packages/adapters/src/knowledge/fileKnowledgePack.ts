import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KnowledgePack } from '@agent-factory/application';
import { isMissingPath, listMarkdownFileNames, markdownSection, SECTION_SEPARATOR } from './markdown-documents.ts';

const UTF8 = 'utf8';

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
      return await listMarkdownFileNames(this.directory);
    } catch (error) {
      if (isMissingPath(error)) return [];
      throw error;
    }
  }

  private async section(name: string): Promise<string> {
    return markdownSection(name, await readFile(join(this.directory, name), UTF8));
  }
}
