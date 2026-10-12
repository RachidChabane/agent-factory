import { describe, expect, it } from 'vitest';
import type { PastedAttachment } from '../contract/index.ts';
import type { AttachmentTray, FilesRead } from './attachment-intake.ts';
import { EMPTY_TRAY, holdsImage, MAX_ATTACHMENTS, readFiles, reduceTray } from './attachment-intake.ts';

const FALLBACK_NAME = 'screenshot.png';

function image(name: string, type = 'image/png'): File {
  return new File([`bytes of ${name}`], name, { type });
}

function attachment(name: string): PastedAttachment {
  return { name, mediaType: 'image/png', dataUrl: `data:image/png;base64,${name}` };
}

function read(partial: Partial<FilesRead>): FilesRead {
  return { attachments: [], notImages: 0, unreadable: 0, ...partial };
}

function trayOf(count: number): AttachmentTray {
  return { attachments: Array.from({ length: count }, (_, index) => attachment(`held-${index}`)), problems: [] };
}

const dataUrlOf = (file: File) => Promise.resolve(`data:${file.type};name=${file.name}`);

describe('holdsImage', () => {
  it('tells an image among other files from files that are not images', () => {
    expect(holdsImage([image('checkout.png'), image('notes.txt', 'text/plain')])).toBe(true);
    expect(holdsImage([image('notes.txt', 'text/plain'), image('export.csv', 'text/csv')])).toBe(false);
    expect(holdsImage([])).toBe(false);
  });
});

describe('readFiles', () => {
  it('reads every image with its name, media type and content', async () => {
    const result = await readFiles([image('checkout.png'), image('cart.jpg', 'image/jpeg')], FALLBACK_NAME, dataUrlOf);
    expect(result).toEqual({
      attachments: [
        { name: 'checkout.png', mediaType: 'image/png', dataUrl: 'data:image/png;name=checkout.png' },
        { name: 'cart.jpg', mediaType: 'image/jpeg', dataUrl: 'data:image/jpeg;name=cart.jpg' },
      ],
      notImages: 0,
      unreadable: 0,
    });
  });

  it('names an image that arrives without a name after the fallback', async () => {
    const result = await readFiles([image('')], FALLBACK_NAME, dataUrlOf);
    expect(result.attachments.map((entry) => entry.name)).toEqual([FALLBACK_NAME]);
  });

  it('counts the files that are not images instead of reading them', async () => {
    const result = await readFiles([image('checkout.png'), image('notes.txt', 'text/plain')], FALLBACK_NAME, dataUrlOf);
    expect(result.attachments.map((entry) => entry.name)).toEqual(['checkout.png']);
    expect(result.notImages).toBe(1);
  });

  it('keeps the images it could read when another one cannot be read', async () => {
    const unreadable = (file: File) => (file.name === 'broken.png' ? Promise.reject(new Error('disk error')) : dataUrlOf(file));
    const result = await readFiles([image('checkout.png'), image('broken.png'), image('cart.png')], FALLBACK_NAME, unreadable);
    expect(result.attachments.map((entry) => entry.name)).toEqual(['checkout.png', 'cart.png']);
    expect(result.unreadable).toBe(1);
  });

  it('reads real file contents into data URLs by default', async () => {
    const result = await readFiles([new File(['abc'], 'pixel.png', { type: 'image/png' })], FALLBACK_NAME);
    expect(result.attachments).toEqual([{ name: 'pixel.png', mediaType: 'image/png', dataUrl: 'data:image/png;base64,YWJj' }]);
  });
});

describe('reduceTray', () => {
  it('appends what was received after what is already held, in order', () => {
    const tray = reduceTray(trayOf(1), { kind: 'received', read: read({ attachments: [attachment('a'), attachment('b')] }) });
    expect(tray.attachments.map((entry) => entry.name)).toEqual(['held-0', 'a', 'b']);
    expect(tray.problems).toEqual([]);
  });

  it(`holds at most ${MAX_ATTACHMENTS} images and reports the ones it left out`, () => {
    const held = 2;
    const room = MAX_ATTACHMENTS - held;
    const received = Array.from({ length: room + 2 }, (_, index) => attachment(`new-${index}`));
    const tray = reduceTray(trayOf(held), { kind: 'received', read: read({ attachments: received }) });
    expect(tray.attachments).toHaveLength(MAX_ATTACHMENTS);
    expect(tray.attachments.at(-1)?.name).toBe(`new-${room - 1}`);
    expect(tray.problems).toEqual(['too-many']);
  });

  it('reports a full tray as too many, not as an empty intake', () => {
    const tray = reduceTray(trayOf(MAX_ATTACHMENTS), { kind: 'received', read: read({ attachments: [attachment('late')] }) });
    expect(tray.attachments).toHaveLength(MAX_ATTACHMENTS);
    expect(tray.problems).toEqual(['too-many']);
  });

  it('reports every kind of problem of the intake, once each', () => {
    const tray = reduceTray(EMPTY_TRAY, { kind: 'received', read: read({ attachments: [attachment('a')], notImages: 2, unreadable: 1 }) });
    expect(tray.problems).toEqual(['not-image', 'unreadable']);
  });

  it('replaces the problems of the previous intake with those of the new one', () => {
    const failed = reduceTray(EMPTY_TRAY, { kind: 'received', read: read({ notImages: 1 }) });
    const next = reduceTray(failed, { kind: 'received', read: read({ attachments: [attachment('a')] }) });
    expect(next.problems).toEqual([]);
  });

  it('removes the image at the given position and clears the problems', () => {
    const tray = reduceTray({ attachments: [attachment('a'), attachment('b'), attachment('c')], problems: ['too-many'] }, { kind: 'removed', index: 1 });
    expect(tray.attachments.map((entry) => entry.name)).toEqual(['a', 'c']);
    expect(tray.problems).toEqual([]);
  });

  it('empties the tray', () => {
    expect(reduceTray(trayOf(3), { kind: 'cleared' })).toEqual(EMPTY_TRAY);
  });
});
