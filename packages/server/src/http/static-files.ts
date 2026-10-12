import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

export const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};
export const FALLBACK_CONTENT_TYPE = 'application/octet-stream';
const PARENT_SEGMENT = '..';
const HTTP_OK = 200;

export function contentTypeOf(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? FALLBACK_CONTENT_TYPE;
}

export function resolveInside(root: string, requested: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const base = resolve(root);
  const candidate = resolve(base, `.${sep}${decoded}`);
  const offset = relative(base, candidate);
  if (offset === '' || isAbsolute(offset) || offset === PARENT_SEGMENT || offset.startsWith(`${PARENT_SEGMENT}${sep}`)) return null;
  return candidate;
}

export async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export function sendFile(response: ServerResponse, path: string): void {
  response.writeHead(HTTP_OK, { 'content-type': contentTypeOf(path), 'x-content-type-options': 'nosniff' });
  createReadStream(path).pipe(response);
}
