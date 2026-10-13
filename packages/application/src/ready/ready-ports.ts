/** Makes a file reachable from where the operator reads their notices, with the command the operator declared. */
export interface MediaUploader {
  /** The address the file can be opened at; throws a `MediaUploadError` saying why it could not be uploaded. */
  upload(path: string): Promise<string>;
}

/** A content hash of a file: two files with the same bytes have the same fingerprint. */
export interface FileFingerprints {
  of(path: string): Promise<string>;
}

/** The links of the files already uploaded, kept by the fingerprint of their content. */
export interface MediaLinkCache {
  find(fingerprint: string): Promise<string | null>;
  remember(fingerprint: string, url: string): Promise<void>;
}

export class MediaUploadError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'MediaUploadError';
  }
}
