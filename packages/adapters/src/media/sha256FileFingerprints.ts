import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { FileFingerprints } from '@agent-factory/application';

const ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';

/** The SHA-256 of a file's bytes, read as a stream so a video never sits whole in memory. */
export class Sha256FileFingerprints implements FileFingerprints {
  of(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash(ALGORITHM);
      const stream = createReadStream(path);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest(DIGEST_ENCODING)));
    });
  }
}
