import type { MediaFailureRecord } from '../pipeline/journal-events.ts';
import type { NoticeLink, OperationLog } from '../ports.ts';
import type { MediaFile } from './ready-media.ts';
import type { FileFingerprints, MediaLinkCache, MediaUploader } from './ready-ports.ts';

export interface MediaPublisherDependencies {
  readonly uploader: MediaUploader;
  readonly fingerprints: FileFingerprints;
  readonly cache: MediaLinkCache;
  readonly log: OperationLog;
}

/** The links of the files that could be made reachable, and the files that could not. */
export interface PublishedMedia {
  readonly links: readonly NoticeLink[];
  readonly failures: readonly MediaFailureRecord[];
}

export const NO_PUBLISHED_MEDIA: PublishedMedia = { links: [], failures: [] };

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Makes files reachable one at a time with the operator's upload command. A file whose content was uploaded before
 * keeps its link, so nothing is uploaded twice. A file that fails leaves its link out and the reason in the log.
 */
export class MediaPublisher {
  private readonly dependencies: MediaPublisherDependencies;

  constructor(dependencies: MediaPublisherDependencies) {
    this.dependencies = dependencies;
  }

  async publish(files: readonly MediaFile[], signal: AbortSignal): Promise<PublishedMedia> {
    const links: NoticeLink[] = [];
    const failures: MediaFailureRecord[] = [];
    for (const file of files) {
      if (signal.aborted) break;
      try {
        links.push({ label: file.label, url: await this.urlOf(file) });
      } catch (error) {
        const reason = reasonOf(error);
        this.dependencies.log.warn(`${file.label} was not uploaded: ${reason}`);
        failures.push({ label: file.label, reason });
      }
    }
    return { links, failures };
  }

  private async urlOf(file: MediaFile): Promise<string> {
    const { uploader, fingerprints, cache } = this.dependencies;
    const fingerprint = await fingerprints.of(file.path);
    const known = await cache.find(fingerprint);
    if (known !== null) return known;
    const url = await uploader.upload(file.path);
    await cache.remember(fingerprint, url);
    return url;
  }
}
