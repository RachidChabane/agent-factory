import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { KnowledgePack, WorkspaceFiles } from '@agent-factory/application';
import { NodeWorkspaceFiles } from '../fs/nodeWorkspaceFiles.ts';
import { PathOutsideWorktreeError } from '../git/errors.ts';
import { isMissingPath, listMarkdownFileNames, markdownSection, SECTION_SEPARATOR } from './markdown-documents.ts';

export type KnowledgeSource =
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'repository'; readonly path: string };

export const SOURCE_UNAVAILABLE_REASONS = {
  notFound: 'no such file or directory',
  outsideRepository: 'the path leaves the repository',
  neitherFileNorDirectory: 'it is neither a file nor a directory',
  directoryInRepository: 'a repository source names a file, not a directory',
} as const;

const UTF8 = 'utf8';
const REPOSITORY_HEADING_SUFFIX = ' (repository)';
const DIRECTORY_CODE = 'EISDIR';

type PathKind = 'file' | 'directory' | 'other' | 'missing';

function unavailable(heading: string, reason: string): string {
  return markdownSection(heading, `(unavailable: ${reason})`);
}

async function kindOf(path: string): Promise<PathKind> {
  try {
    const entry = await stat(path);
    if (entry.isFile()) return 'file';
    return entry.isDirectory() ? 'directory' : 'other';
  } catch (error) {
    if (isMissingPath(error)) return 'missing';
    throw error;
  }
}

function isDirectoryError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === DIRECTORY_CODE;
}

/** Why a repository source cannot be read, for the errors that mean the source is wrong rather than the machine. */
function repositoryUnavailableReason(error: unknown): string | null {
  if (error instanceof PathOutsideWorktreeError) return SOURCE_UNAVAILABLE_REASONS.outsideRepository;
  return isDirectoryError(error) ? SOURCE_UNAVAILABLE_REASONS.directoryInRepository : null;
}

type RepositoryRead = { readonly content: string } | { readonly unavailable: string };

/** One document of a knowledge source, as the cockpit lists it. */
export interface KnowledgeDocument {
  readonly path: string;
  readonly title: string;
  readonly bytes: number;
}

const TITLE_LINE = /^#\s+(.+)$/m;

function titleOf(path: string, content: string): string {
  return TITLE_LINE.exec(content)?.[1]?.trim() ?? basename(path);
}

async function documentOf(path: string): Promise<KnowledgeDocument> {
  const content = await readFile(path, UTF8);
  return { path, title: titleOf(path, content), bytes: Buffer.byteLength(content, UTF8) };
}

export class SourcesKnowledgePack implements KnowledgePack {
  private readonly sources: readonly KnowledgeSource[];
  private readonly repositoryRoot: string;
  private readonly files: WorkspaceFiles;

  constructor(sources: readonly KnowledgeSource[], repositoryRoot: string, files: WorkspaceFiles = new NodeWorkspaceFiles()) {
    this.sources = sources;
    this.repositoryRoot = repositoryRoot;
    this.files = files;
  }

  async read(): Promise<string> {
    const sections = await Promise.all(this.sources.map((source) => this.sectionsOf(source)));
    return sections.flat().join(SECTION_SEPARATOR);
  }

  /** The documents of one source; a source that cannot be read throws with the reason. */
  async documents(source: KnowledgeSource): Promise<readonly KnowledgeDocument[]> {
    if (source.kind === 'repository') return this.repositoryDocuments(source.path);
    switch (await kindOf(source.path)) {
      case 'file':
        return [await documentOf(source.path)];
      case 'directory':
        return Promise.all((await listMarkdownFileNames(source.path)).map((name) => documentOf(join(source.path, name))));
      case 'missing':
        throw new Error(SOURCE_UNAVAILABLE_REASONS.notFound);
      case 'other':
        throw new Error(SOURCE_UNAVAILABLE_REASONS.neitherFileNorDirectory);
    }
  }

  get sourceList(): readonly KnowledgeSource[] {
    return this.sources;
  }

  private sectionsOf(source: KnowledgeSource): Promise<readonly string[]> {
    return source.kind === 'path' ? this.pathSections(source.path) : this.repositorySections(source.path);
  }

  private async pathSections(path: string): Promise<readonly string[]> {
    switch (await kindOf(path)) {
      case 'file':
        return [markdownSection(path, await readFile(path, UTF8))];
      case 'directory':
        return this.directorySections(path);
      case 'missing':
        return [unavailable(path, SOURCE_UNAVAILABLE_REASONS.notFound)];
      case 'other':
        return [unavailable(path, SOURCE_UNAVAILABLE_REASONS.neitherFileNorDirectory)];
    }
  }

  private async directorySections(directory: string): Promise<readonly string[]> {
    const names = await listMarkdownFileNames(directory);
    return Promise.all(names.map(async (name) => markdownSection(join(directory, name), await readFile(join(directory, name), UTF8))));
  }

  private async repositorySections(path: string): Promise<readonly string[]> {
    const heading = `${path}${REPOSITORY_HEADING_SUFFIX}`;
    const read = await this.readRepositorySource(path);
    return ['content' in read ? markdownSection(heading, read.content) : unavailable(heading, read.unavailable)];
  }

  private async repositoryDocuments(path: string): Promise<readonly KnowledgeDocument[]> {
    const read = await this.readRepositorySource(path);
    if (!('content' in read)) throw new Error(read.unavailable);
    return [{ path, title: titleOf(path, read.content), bytes: Buffer.byteLength(read.content, UTF8) }];
  }

  /** The text of a file of the clone, or why the source cannot be read; only an error of the machine throws. */
  private async readRepositorySource(path: string): Promise<RepositoryRead> {
    try {
      const content = await this.files.readText(this.repositoryRoot, path);
      return content === null ? { unavailable: SOURCE_UNAVAILABLE_REASONS.notFound } : { content };
    } catch (error) {
      const unavailableReason = repositoryUnavailableReason(error);
      if (unavailableReason === null) throw error;
      return { unavailable: unavailableReason };
    }
  }
}
