import { Buffer } from 'node:buffer';
import { crc32, deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEADER_CHUNK = 'IHDR';
const DATA_CHUNK = 'IDAT';
const END_CHUNK = 'IEND';
const BIT_DEPTH = 8;
const COLOR_TYPE_RGB = 2;
const COMPRESSION_METHOD = 0;
const FILTER_METHOD = 0;
const NO_INTERLACE = 0;
const NO_ROW_FILTER = 0;
const UINT32_BYTES = 4;
const CHECKOUT_SCREENSHOT_SIZE = 8;
const CHECKOUT_SCREENSHOT_COLOUR = [0x2f, 0x6f, 0xd8] as const;

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(UINT32_BYTES);
  bytes.writeUInt32BE(value);
  return bytes;
}

function chunk(type: string, data: Buffer): Buffer {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  return Buffer.concat([uint32(data.length), typed, uint32(crc32(typed))]);
}

function solidPng(size: number, colour: readonly [number, number, number]): Buffer {
  const header = Buffer.concat([uint32(size), uint32(size), Buffer.from([BIT_DEPTH, COLOR_TYPE_RGB, COMPRESSION_METHOD, FILTER_METHOD, NO_INTERLACE])]);
  const row = Buffer.concat([Buffer.from([NO_ROW_FILTER]), Buffer.from(Array.from({ length: size }, () => colour).flat())]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)));
  return Buffer.concat([PNG_SIGNATURE, chunk(HEADER_CHUNK, header), chunk(DATA_CHUNK, pixels), chunk(END_CHUNK, Buffer.alloc(0))]);
}

/** A file the way Playwright hands one to a file input. */
export interface UploadedImage {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

/** A small picture of a checkout summary, as a requester would attach to a request. */
export const CHECKOUT_SCREENSHOT: UploadedImage = {
  name: 'checkout-summary.png',
  mimeType: 'image/png',
  buffer: solidPng(CHECKOUT_SCREENSHOT_SIZE, CHECKOUT_SCREENSHOT_COLOUR),
};
