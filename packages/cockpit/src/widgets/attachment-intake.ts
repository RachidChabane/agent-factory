import type { PastedAttachment } from '../contract/index.ts';

const IMAGE_MEDIA_PREFIX = 'image/';

export const MAX_ATTACHMENTS = 6;

/** What kept a file out of the tray. */
export type IntakeProblem = 'not-image' | 'unreadable' | 'too-many';

export interface AttachmentTray {
  readonly attachments: readonly PastedAttachment[];
  /** The problems of the last intake only; they clear as soon as the operator changes the tray. */
  readonly problems: readonly IntakeProblem[];
}

export const EMPTY_TRAY: AttachmentTray = { attachments: [], problems: [] };

export interface FilesRead {
  readonly attachments: readonly PastedAttachment[];
  readonly notImages: number;
  readonly unreadable: number;
}

export type TrayAction =
  | { readonly kind: 'received'; readonly read: FilesRead }
  | { readonly kind: 'removed'; readonly index: number }
  | { readonly kind: 'cleared' };

export type DataUrlReader = (file: File) => Promise<string>;

function isImage(file: File): boolean {
  return file.type.startsWith(IMAGE_MEDIA_PREFIX);
}

export function holdsImage(files: readonly File[]): boolean {
  return files.some(isImage);
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`${file.name} is not readable as text`))));
    reader.addEventListener('error', () => reject(reader.error ?? new Error(`${file.name} could not be read`)));
    reader.readAsDataURL(file);
  });
}

/** Reads the images among the files and counts what was left out, so the operator can be told. */
export async function readFiles(files: readonly File[], fallbackName: string, readDataUrl: DataUrlReader = readAsDataUrl): Promise<FilesRead> {
  const images = files.filter(isImage);
  const outcomes = await Promise.allSettled(
    images.map(async (file): Promise<PastedAttachment> => ({ name: file.name || fallbackName, mediaType: file.type, dataUrl: await readDataUrl(file) })),
  );
  return {
    attachments: outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : [])),
    notImages: files.length - images.length,
    unreadable: outcomes.filter((outcome) => outcome.status === 'rejected').length,
  };
}

function problemsOf(read: FilesRead, kept: number): readonly IntakeProblem[] {
  return [
    ...(read.notImages > 0 ? (['not-image'] as const) : []),
    ...(read.unreadable > 0 ? (['unreadable'] as const) : []),
    ...(read.attachments.length > kept ? (['too-many'] as const) : []),
  ];
}

export function reduceTray(tray: AttachmentTray, action: TrayAction): AttachmentTray {
  switch (action.kind) {
    case 'received': {
      const accepted = action.read.attachments.slice(0, Math.max(0, MAX_ATTACHMENTS - tray.attachments.length));
      return { attachments: [...tray.attachments, ...accepted], problems: problemsOf(action.read, accepted.length) };
    }
    case 'removed':
      return { attachments: tray.attachments.filter((_, position) => position !== action.index), problems: [] };
    case 'cleared':
      return EMPTY_TRAY;
  }
}
