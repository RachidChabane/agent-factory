import { describe, expect, it } from 'vitest';
import { MediaPublisher } from './media-publisher.ts';
import { ContentFingerprints, FakeUploader, FILES_HOST, MemoryLinkCache } from './testing/ready-fakes.ts';

const SIGNAL = new AbortController().signal;

function publisherOf() {
  const uploader = new FakeUploader();
  const cache = new MemoryLinkCache();
  const fingerprints = new ContentFingerprints();
  const warnings: string[] = [];
  const publisher = new MediaPublisher({ uploader, fingerprints, cache, log: { info: () => undefined, warn: (line) => void warnings.push(line) } });
  return { publisher, uploader, cache, fingerprints, warnings };
}

describe('MediaPublisher', () => {
  it('uploads each file and links it under its label', async () => {
    const { publisher, uploader } = publisherOf();
    const published = await publisher.publish(
      [
        { path: '/cache/a.mp4', label: 'tour · before · a.mp4' },
        { path: '/cache/b.png', label: 'tour · before · b.png' },
      ],
      SIGNAL,
    );
    expect(uploader.uploads).toEqual(['/cache/a.mp4', '/cache/b.png']);
    expect(published).toEqual({
      links: [
        { label: 'tour · before · a.mp4', url: `${FILES_HOST}/a.mp4` },
        { label: 'tour · before · b.png', url: `${FILES_HOST}/b.png` },
      ],
      failures: [],
    });
  });

  it('keeps the link of a content it uploaded before, whatever the path or the label', async () => {
    const { publisher, uploader, fingerprints } = publisherOf();
    fingerprints.contents.set('/cache/one.png', 'same-bytes');
    fingerprints.contents.set('/cache/two.png', 'same-bytes');
    await publisher.publish([{ path: '/cache/one.png', label: 'evidence · before · one.png' }], SIGNAL);

    const again = await publisher.publish([{ path: '/cache/two.png', label: 'evidence · after · two.png' }], SIGNAL);

    expect(uploader.uploads).toEqual(['/cache/one.png']);
    expect(again.links).toEqual([{ label: 'evidence · after · two.png', url: `${FILES_HOST}/one.png` }]);
  });

  it('uploads a file again when its content changed', async () => {
    const { publisher, uploader, fingerprints } = publisherOf();
    fingerprints.contents.set('/cache/film.mp4', 'first-take');
    await publisher.publish([{ path: '/cache/film.mp4', label: 'film' }], SIGNAL);
    fingerprints.contents.set('/cache/film.mp4', 'second-take');
    await publisher.publish([{ path: '/cache/film.mp4', label: 'film' }], SIGNAL);
    expect(uploader.uploads).toHaveLength(2);
  });

  it('leaves the link of a failed upload out, names the reason, writes it to the log and goes on', async () => {
    const { publisher, uploader, cache, warnings } = publisherOf();
    uploader.failures.set('broken', 'the upload command exited with 3: no space left');

    const published = await publisher.publish(
      [
        { path: '/cache/broken.mp4', label: 'tour · after · broken.mp4' },
        { path: '/cache/fine.png', label: 'tour · after · fine.png' },
      ],
      SIGNAL,
    );

    expect(published.links).toEqual([{ label: 'tour · after · fine.png', url: `${FILES_HOST}/fine.png` }]);
    expect(published.failures).toEqual([{ label: 'tour · after · broken.mp4', reason: 'the upload command exited with 3: no space left' }]);
    expect(warnings).toEqual(['tour · after · broken.mp4 was not uploaded: the upload command exited with 3: no space left']);
    expect(cache.links.has('/cache/broken.mp4')).toBe(false);
  });

  it('reports a file it cannot read as a failure, not as an exception', async () => {
    const { cache, uploader } = publisherOf();
    const publisher = new MediaPublisher({
      uploader,
      cache,
      fingerprints: { of: () => Promise.reject(new Error("ENOENT: no such file or directory, open '/cache/gone.png'")) },
      log: { info: () => undefined, warn: () => undefined },
    });
    const published = await publisher.publish([{ path: '/cache/gone.png', label: 'evidence · after · gone.png' }], SIGNAL);
    expect(published.failures).toEqual([{ label: 'evidence · after · gone.png', reason: "ENOENT: no such file or directory, open '/cache/gone.png'" }]);
  });

  it('stops uploading once the factory is stopping', async () => {
    const { publisher, uploader } = publisherOf();
    const stopping = new AbortController();
    stopping.abort();
    expect(await publisher.publish([{ path: '/cache/a.mp4', label: 'a' }], stopping.signal)).toEqual({ links: [], failures: [] });
    expect(uploader.uploads).toEqual([]);
  });
});
