import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
};
export const FALLBACK_CONTENT_TYPE = 'application/octet-stream';
const PARENT_SEGMENT = '..';
const HTTP = { ok: 200, partialContent: 206, unsatisfiableRange: 416 } as const;
const RANGE_UNIT = 'bytes=';
const RANGE_PATTERN = /^(\d*)-(\d*)$/;
const MULTIPLE_RANGES_SEPARATOR = ',';
const HEAD = 'HEAD';

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

export type ByteRange =
  | { readonly kind: 'whole' }
  | { readonly kind: 'partial'; readonly start: number; readonly end: number }
  | { readonly kind: 'unsatisfiable' };

const WHOLE: ByteRange = { kind: 'whole' };
const UNSATISFIABLE: ByteRange = { kind: 'unsatisfiable' };

/** The bytes a `Range` header asks of a file of this size. Several ranges, or a malformed one, ask for the whole file. */
export function parseByteRange(header: string | undefined, size: number): ByteRange {
  if (header === undefined || !header.startsWith(RANGE_UNIT) || header.includes(MULTIPLE_RANGES_SEPARATOR)) return WHOLE;
  const match = RANGE_PATTERN.exec(header.slice(RANGE_UNIT.length).trim());
  if (match === null) return WHOLE;
  const [, first = '', last = ''] = match;
  if (first === '' && last === '') return WHOLE;
  if (first === '') {
    const suffix = Number(last);
    return suffix === 0 || size === 0 ? UNSATISFIABLE : { kind: 'partial', start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (start >= size) return UNSATISFIABLE;
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  return end < start ? WHOLE : { kind: 'partial', start, end };
}

type ResponseHeaders = Readonly<Record<string, string | number>>;

/** The status and headers that answer a request for a body of this size, and which bytes of it to send. */
interface RangedAnswer {
  readonly status: number;
  readonly headers: ResponseHeaders;
  /** The inclusive window of bytes to send; null when there are none. */
  readonly window: { readonly start: number; readonly end: number } | null;
}

function answerRange(request: IncomingMessage, size: number, headers: ResponseHeaders): RangedAnswer {
  const announced = { ...headers, 'accept-ranges': 'bytes' };
  const range = parseByteRange(request.headers.range, size);
  if (range.kind === 'unsatisfiable') return { status: HTTP.unsatisfiableRange, headers: { ...announced, 'content-range': `bytes */${size}` }, window: null };
  const partial = range.kind === 'partial';
  const start = partial ? range.start : 0;
  const end = partial ? range.end : size - 1;
  return {
    status: partial ? HTTP.partialContent : HTTP.ok,
    headers: { ...announced, 'content-length': size === 0 ? 0 : end - start + 1, ...(partial ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) },
    window: size === 0 ? null : { start, end },
  };
}

function sendsBody(request: IncomingMessage, answer: RangedAnswer): answer is RangedAnswer & { readonly window: NonNullable<RangedAnswer['window']> } {
  return request.method !== HEAD && answer.window !== null;
}

/** Sends a file, or the part of it that was asked for, so that a video can be played and sought. */
export async function sendFile(request: IncomingMessage, response: ServerResponse, path: string): Promise<void> {
  const { size } = await stat(path);
  const answer = answerRange(request, size, { 'content-type': contentTypeOf(path), 'x-content-type-options': 'nosniff' });
  response.writeHead(answer.status, answer.headers);
  if (!sendsBody(request, answer)) {
    response.end();
    return;
  }
  createReadStream(path, answer.window).pipe(response);
}

/** Sends bytes held in memory, or the part of them that was asked for, with the given headers. */
export function sendBytes(request: IncomingMessage, response: ServerResponse, bytes: Uint8Array, headers: ResponseHeaders): void {
  const answer = answerRange(request, bytes.byteLength, headers);
  response.writeHead(answer.status, answer.headers);
  if (!sendsBody(request, answer)) {
    response.end();
    return;
  }
  response.end(bytes.subarray(answer.window.start, answer.window.end + 1));
}
