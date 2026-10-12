import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentTypeOf, parseByteRange, sendBytes, sendFile } from './static-files.ts';

const CONTENT = '0123456789';
const SIZE = CONTENT.length;
const BYTES_ROUTE = '/bytes.mp4';

describe('byte range parsing', () => {
  it('reads bounded, open-ended and suffix ranges', () => {
    expect(parseByteRange('bytes=0-1', SIZE)).toEqual({ kind: 'partial', start: 0, end: 1 });
    expect(parseByteRange('bytes=4-', SIZE)).toEqual({ kind: 'partial', start: 4, end: 9 });
    expect(parseByteRange('bytes=-3', SIZE)).toEqual({ kind: 'partial', start: 7, end: 9 });
    expect(parseByteRange('bytes=2-100', SIZE)).toEqual({ kind: 'partial', start: 2, end: 9 });
    expect(parseByteRange('bytes=-100', SIZE)).toEqual({ kind: 'partial', start: 0, end: 9 });
  });

  it('flags a range that starts past the end', () => {
    expect(parseByteRange('bytes=10-', SIZE)).toEqual({ kind: 'unsatisfiable' });
    expect(parseByteRange('bytes=-0', SIZE)).toEqual({ kind: 'unsatisfiable' });
    expect(parseByteRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
  });

  it('serves the whole file for a missing, multiple, malformed or inverted range', () => {
    for (const header of [undefined, 'bytes=0-1,4-5', 'items=0-1', 'bytes=a-b', 'bytes=-', 'bytes=5-2', 'bytes=0-1-2']) {
      expect(parseByteRange(header, SIZE)).toEqual({ kind: 'whole' });
    }
  });
});

describe('content types', () => {
  it('serves the video formats a film may leave as video', () => {
    expect(contentTypeOf('/store/before/film.mp4')).toBe('video/mp4');
    expect(contentTypeOf('/store/before/film.WEBM')).toBe('video/webm');
    expect(contentTypeOf('/store/before/film.mov')).toBe('video/quicktime');
    expect(contentTypeOf('/store/before/film.mkv')).toBe('video/x-matroska');
  });
});

describe('sending files and bytes', () => {
  let directory = '';
  let server: Server;
  let base = '';

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'static-files-'));
    await writeFile(join(directory, 'video.mp4'), CONTENT);
    await writeFile(join(directory, 'empty.mp4'), '');
    server = createServer((request, response) => {
      const name = (request.url ?? '/').slice(1);
      if (`/${name}` === BYTES_ROUTE) sendBytes(request, response, Buffer.from(CONTENT), { 'content-type': 'video/mp4' });
      else void sendFile(request, response, join(directory, name));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['/video.mp4', BYTES_ROUTE])('announces range support and the length on the whole of %s', async (route) => {
    const response = await fetch(`${base}${route}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-length')).toBe(String(SIZE));
    expect(await response.text()).toBe(CONTENT);
  });

  it.each(['/video.mp4', BYTES_ROUTE])('answers the probe Safari sends, bytes=0-1, with 206 and the two bytes of %s', async (route) => {
    const response = await fetch(`${base}${route}`, { headers: { range: 'bytes=0-1' } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes 0-1/${SIZE}`);
    expect(response.headers.get('content-length')).toBe('2');
    expect(await response.text()).toBe('01');
  });

  it.each(['/video.mp4', BYTES_ROUTE])('answers the open-ended and suffix ranges used for seeking in %s', async (route) => {
    const open = await fetch(`${base}${route}`, { headers: { range: 'bytes=6-' } });
    expect(open.status).toBe(206);
    expect(open.headers.get('content-range')).toBe(`bytes 6-9/${SIZE}`);
    expect(await open.text()).toBe('6789');
    const suffix = await fetch(`${base}${route}`, { headers: { range: 'bytes=-2' } });
    expect(await suffix.text()).toBe('89');
  });

  it.each(['/video.mp4', BYTES_ROUTE])('answers 416 with the size when the range of %s starts past the end', async (route) => {
    const response = await fetch(`${base}${route}`, { headers: { range: 'bytes=50-60' } });
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe(`bytes */${SIZE}`);
  });

  it.each(['/video.mp4', BYTES_ROUTE])('answers several ranges of %s with the whole of it', async (route) => {
    const response = await fetch(`${base}${route}`, { headers: { range: 'bytes=0-1,4-5' } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(CONTENT);
  });

  it('answers a HEAD request with the headers only, and serves an empty file', async () => {
    const head = await fetch(`${base}/video.mp4`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(SIZE));
    expect(await head.text()).toBe('');
    const empty = await fetch(`${base}/empty.mp4`);
    expect(empty.status).toBe(200);
    expect(empty.headers.get('content-length')).toBe('0');
  });
});
