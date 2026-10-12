/** The pixel size of an image, as its own header states it. */
export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** How many bytes of a file are enough to find the size of any image this module reads. */
export const IMAGE_HEADER_BYTES = 256 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const GIF_SIGNATURE = 'GIF8';
const GIF_WIDTH_OFFSET = 6;
const GIF_HEIGHT_OFFSET = 8;
const RIFF_SIGNATURE = 'RIFF';
const WEBP_SIGNATURE = 'WEBP';
const WEBP_FORMAT_OFFSET = 8;
const WEBP_CHUNK_OFFSET = 12;
const WEBP_LOSSY = 'VP8 ';
const WEBP_LOSSLESS = 'VP8L';
const WEBP_EXTENDED = 'VP8X';
const WEBP_LOSSY_SIZE_OFFSET = 26;
const WEBP_LOSSLESS_SIZE_OFFSET = 21;
const WEBP_EXTENDED_SIZE_OFFSET = 24;
const FOURTEEN_BITS = 0x3fff;
const LOSSLESS_HEIGHT_SHIFT = 14;
const JPEG_START = [0xff, 0xd8] as const;
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_FIRST_SEGMENT_OFFSET = 2;
const JPEG_START_OF_FRAME_MARKERS: ReadonlySet<number> = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const JPEG_FRAME_HEIGHT_OFFSET = 5;
const JPEG_FRAME_WIDTH_OFFSET = 7;
const JPEG_SEGMENT_LENGTH_OFFSET = 2;
const SVG_TAG = /<svg\b[^>]*>/i;
const SVG_WIDTH = /\swidth\s*=\s*["']\s*([\d.]+)\s*(px)?\s*["']/i;
const SVG_HEIGHT = /\sheight\s*=\s*["']\s*([\d.]+)\s*(px)?\s*["']/i;
const SVG_VIEW_BOX = /\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function sized(width: number, height: number): ImageSize | null {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width: Math.round(width), height: Math.round(height) } : null;
}

function pngSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < PNG_HEIGHT_OFFSET + 4 || !startsWith(bytes, PNG_SIGNATURE)) return null;
  return sized(view(bytes).getUint32(PNG_WIDTH_OFFSET), view(bytes).getUint32(PNG_HEIGHT_OFFSET));
}

function gifSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < GIF_HEIGHT_OFFSET + 2 || ascii(bytes, 0, GIF_SIGNATURE.length) !== GIF_SIGNATURE) return null;
  return sized(view(bytes).getUint16(GIF_WIDTH_OFFSET, true), view(bytes).getUint16(GIF_HEIGHT_OFFSET, true));
}

function webpSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < WEBP_LOSSY_SIZE_OFFSET + 4) return null;
  if (ascii(bytes, 0, RIFF_SIGNATURE.length) !== RIFF_SIGNATURE || ascii(bytes, WEBP_FORMAT_OFFSET, WEBP_SIGNATURE.length) !== WEBP_SIGNATURE) return null;
  const data = view(bytes);
  const chunk = ascii(bytes, WEBP_CHUNK_OFFSET, 4);
  if (chunk === WEBP_LOSSY) {
    return sized(data.getUint16(WEBP_LOSSY_SIZE_OFFSET, true) & FOURTEEN_BITS, data.getUint16(WEBP_LOSSY_SIZE_OFFSET + 2, true) & FOURTEEN_BITS);
  }
  if (chunk === WEBP_LOSSLESS) {
    const bits = data.getUint32(WEBP_LOSSLESS_SIZE_OFFSET, true);
    return sized((bits & FOURTEEN_BITS) + 1, ((bits >> LOSSLESS_HEIGHT_SHIFT) & FOURTEEN_BITS) + 1);
  }
  if (chunk === WEBP_EXTENDED) {
    const width = 1 + (data.getUint16(WEBP_EXTENDED_SIZE_OFFSET, true) | (data.getUint8(WEBP_EXTENDED_SIZE_OFFSET + 2) << 16));
    const height = 1 + (data.getUint16(WEBP_EXTENDED_SIZE_OFFSET + 3, true) | (data.getUint8(WEBP_EXTENDED_SIZE_OFFSET + 5) << 16));
    return sized(width, height);
  }
  return null;
}

function jpegSize(bytes: Uint8Array): ImageSize | null {
  if (!startsWith(bytes, JPEG_START)) return null;
  const data = view(bytes);
  let offset = JPEG_FIRST_SEGMENT_OFFSET;
  while (offset + JPEG_FRAME_WIDTH_OFFSET + 2 <= bytes.length) {
    if (bytes[offset] !== JPEG_MARKER_PREFIX) return null;
    const marker = bytes[offset + 1] ?? 0;
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      return sized(data.getUint16(offset + JPEG_FRAME_WIDTH_OFFSET), data.getUint16(offset + JPEG_FRAME_HEIGHT_OFFSET));
    }
    offset += JPEG_SEGMENT_LENGTH_OFFSET + data.getUint16(offset + JPEG_SEGMENT_LENGTH_OFFSET);
  }
  return null;
}

function svgSize(bytes: Uint8Array): ImageSize | null {
  const tag = SVG_TAG.exec(new TextDecoder().decode(bytes))?.[0];
  if (tag === undefined) return null;
  const width = SVG_WIDTH.exec(tag)?.[1];
  const height = SVG_HEIGHT.exec(tag)?.[1];
  if (width !== undefined && height !== undefined) return sized(Number(width), Number(height));
  const box = SVG_VIEW_BOX.exec(tag);
  return box === null ? null : sized(Number(box[1]), Number(box[2]));
}

/** The size a PNG, GIF, WebP, JPEG or SVG image declares in its first bytes; null for anything else. */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  return pngSize(bytes) ?? gifSize(bytes) ?? webpSize(bytes) ?? jpegSize(bytes) ?? svgSize(bytes);
}
