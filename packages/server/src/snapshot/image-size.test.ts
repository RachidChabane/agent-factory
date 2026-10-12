import { deflateSync } from 'node:zlib';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { imageSize } from './image-size.ts';

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function pngChunk(type: string, data: Buffer): Buffer {
  return Buffer.concat([uint32(data.length), Buffer.from(type, 'ascii'), data, uint32(0)]);
}

function png(width: number, height: number): Buffer {
  const header = Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 6, 0, 0, 0])]);
  const pixels = deflateSync(Buffer.alloc((width * 4 + 1) * Math.min(height, 2)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', header), pngChunk('IDAT', pixels), pngChunk('IEND', Buffer.alloc(0))]);
}

function gif(width: number, height: number): Buffer {
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(width, 0);
  screen.writeUInt16LE(height, 2);
  return Buffer.concat([Buffer.from('GIF89a', 'ascii'), screen, Buffer.from([0x3b])]);
}

function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0', 'ascii'), Buffer.alloc(9)]);
  const frame = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, frame, Buffer.from([0xff, 0xd9])]);
}

function webpExtended(width: number, height: number): Buffer {
  const chunk = Buffer.alloc(10);
  chunk.writeUIntLE(width - 1, 4, 3);
  chunk.writeUIntLE(height - 1, 7, 3);
  const body = Buffer.concat([Buffer.from('WEBPVP8X', 'ascii'), uint32(0).reverse(), chunk]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), size, body]);
}

function webpLossless(width: number, height: number): Buffer {
  const bits = Buffer.alloc(4);
  bits.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14));
  const body = Buffer.concat([Buffer.from('WEBPVP8L', 'ascii'), uint32(5).reverse(), Buffer.from([0x2f]), bits, Buffer.alloc(8)]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), size, body]);
}

const dimension = fc.integer({ min: 1, max: 4000 });

describe('the size an image declares', () => {
  it.each([
    ['PNG', png(1280, 720)],
    ['GIF', gif(1280, 720)],
    ['JPEG', jpeg(1280, 720)],
    ['extended WebP', webpExtended(1280, 720)],
    ['lossless WebP', webpLossless(1280, 720)],
    ['SVG with a width and a height', Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720px"><rect/></svg>')],
    ['SVG with a view box only', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"></svg>')],
  ])('reads %s', (_format, bytes) => {
    expect(imageSize(bytes)).toEqual({ width: 1280, height: 720 });
  });

  it('reads any size a PNG, a GIF, a JPEG or a WebP declares', () => {
    fc.assert(
      fc.property(dimension, dimension, (width, height) => {
        for (const bytes of [png(width, height), gif(width, height), jpeg(width, height), webpExtended(width, height), webpLossless(width, height)]) {
          expect(imageSize(bytes)).toEqual({ width, height });
        }
      }),
      { numRuns: 50 },
    );
  });

  it('says nothing about a file that is not an image, a truncated header or a zero size', () => {
    expect(imageSize(Buffer.from('plain text log\n'))).toBeNull();
    expect(imageSize(png(10, 10).subarray(0, 12))).toBeNull();
    expect(imageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="10"></svg>'))).toBeNull();
    expect(imageSize(Buffer.alloc(0))).toBeNull();
  });

  it('never throws on arbitrary bytes', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
      expect(() => imageSize(bytes)).not.toThrow();
    }));
  });
});
