import type { NoticeLink, Notifier } from '../../ports.ts';
import { MediaUploadError, type FileFingerprints, type MediaLinkCache, type MediaUploader } from '../ready-ports.ts';

export const FILES_HOST = 'https://files.example.test';

/** Uploads nothing: it answers with an address built from the file's name, and fails the files it is told to. */
export class FakeUploader implements MediaUploader {
  readonly uploads: string[] = [];
  readonly failures = new Map<string, string>();

  upload(path: string): Promise<string> {
    this.uploads.push(path);
    const failure = [...this.failures].find(([fragment]) => path.includes(fragment));
    if (failure !== undefined) return Promise.reject(new MediaUploadError(failure[1]));
    return Promise.resolve(`${FILES_HOST}/${path.slice(path.lastIndexOf('/') + 1)}`);
  }
}

export class MemoryLinkCache implements MediaLinkCache {
  readonly links = new Map<string, string>();

  find(fingerprint: string): Promise<string | null> {
    return Promise.resolve(this.links.get(fingerprint) ?? null);
  }

  remember(fingerprint: string, url: string): Promise<void> {
    this.links.set(fingerprint, url);
    return Promise.resolve();
  }
}

/** The fingerprint of a file is its content, as the test declares it; a file it does not know is its own path. */
export class ContentFingerprints implements FileFingerprints {
  readonly contents = new Map<string, string>();

  of(path: string): Promise<string> {
    return Promise.resolve(this.contents.get(path) ?? path);
  }
}

export interface SentNotice {
  readonly title: string;
  readonly body: string;
  readonly link: string;
  readonly media: readonly NoticeLink[];
}

export class RecordingNotifier implements Notifier {
  readonly sent: SentNotice[] = [];
  failures = 0;

  notify(title: string, body: string, link: string, media: readonly NoticeLink[] = []): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error('the chat webhook answered HTTP 500'));
    }
    this.sent.push({ title, body, link, media });
    return Promise.resolve();
  }
}
