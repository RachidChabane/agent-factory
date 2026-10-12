import { copyFile, lstat, mkdir, readFile, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { WorkspaceFiles } from '@agent-factory/application';
import { isWithin } from '@agent-factory/plugin';
import { PathOutsideWorktreeError } from '../git/errors.ts';
import { resolveInside } from '../paths/inside-root.ts';

const MISSING_FILE_CODES: readonly string[] = ['ENOENT', 'ENOTDIR'];
const UTF8 = 'utf8';

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && MISSING_FILE_CODES.includes(error.code);
}

async function realLocation(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function containedExisting(root: string, relativePath: string): Promise<string | null> {
  const target = resolveInside(root, relativePath);
  const [realRoot, realTarget] = await Promise.all([realLocation(root), realLocation(target)]);
  if (realRoot === null || realTarget === null || !isWithin(realRoot, realTarget)) return null;
  return target;
}

async function writableInside(root: string, relativePath: string): Promise<string> {
  const target = resolveInside(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  const [realRoot, realParent] = await Promise.all([realpath(root), realpath(dirname(target))]);
  if (!isWithin(realRoot, realParent)) throw new PathOutsideWorktreeError(relativePath);
  const existing = await lstat(target).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  if (existing?.isSymbolicLink() === true) await unlink(target);
  return target;
}

export class NodeWorkspaceFiles implements WorkspaceFiles {
  async readText(root: string, relativePath: string): Promise<string | null> {
    const source = await containedExisting(root, relativePath);
    if (source === null) return null;
    try {
      return await readFile(source, UTF8);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async writeText(root: string, relativePath: string, content: string): Promise<void> {
    await writeFile(await writableInside(root, relativePath), content);
  }

  async exists(root: string, relativePath: string): Promise<boolean> {
    const target = await containedExisting(root, relativePath);
    if (target === null) return false;
    try {
      await stat(target);
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async copyFile(fromRoot: string, fromRelativePath: string, toRoot: string, toRelativePath: string): Promise<boolean> {
    resolveInside(toRoot, toRelativePath);
    const source = await containedExisting(fromRoot, fromRelativePath);
    if (source === null) return false;
    try {
      await copyFile(source, await writableInside(toRoot, toRelativePath));
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async remove(root: string, relativePath: string): Promise<void> {
    await rm(resolveInside(root, relativePath), { recursive: true, force: true });
  }

  async makeDirectory(root: string, relativePath: string): Promise<void> {
    const target = resolveInside(root, relativePath);
    await mkdir(target, { recursive: true });
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
    if (!isWithin(realRoot, realTarget)) throw new PathOutsideWorktreeError(relativePath);
  }
}
