import { open, stat } from 'node:fs/promises';
import { IMAGE_HEADER_BYTES, imageSize, type ImageSize } from './image-size.ts';

interface Measured {
  readonly stamp: string;
  readonly size: ImageSize | null;
}

/** The sizes of image files, read from their headers once per version of each file. */
export class ImageSizes {
  private readonly measured = new Map<string, Measured>();

  async of(path: string): Promise<ImageSize | null> {
    const info = await stat(path).catch(() => null);
    if (info === null || !info.isFile()) return null;
    const stamp = `${info.size}:${info.mtimeMs}`;
    const known = this.measured.get(path);
    if (known?.stamp === stamp) return known.size;
    const size = imageSize(await this.header(path));
    this.measured.set(path, { stamp, size });
    return size;
  }

  private async header(path: string): Promise<Uint8Array> {
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(IMAGE_HEADER_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, IMAGE_HEADER_BYTES, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }
}
