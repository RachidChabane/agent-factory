import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { hasErrorCode } from '../errors.ts';
import type { WorkingTree, WriteReceipt } from './working-tree.ts';

const MISSING_FILE = 'ENOENT';

export class NodeWorkingTree implements WorkingTree {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  absolute(relativePath: string): string {
    return resolve(this.#root, relativePath);
  }

  async write(absolutePath: string, content: string): Promise<WriteReceipt> {
    const previousContent = await readIfPresent(absolutePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
    return { created: previousContent === null, previousContent };
  }

  async remove(absolutePath: string): Promise<void> {
    await rm(absolutePath, { force: true });
  }
}

async function readIfPresent(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, MISSING_FILE)) {
      return null;
    }
    throw error;
  }
}
