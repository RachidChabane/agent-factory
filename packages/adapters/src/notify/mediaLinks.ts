import type { NoticeLink } from '@agent-factory/application';

/** A chat message that lists more links than this stops being readable; the rest are left to the cockpit. */
export const MAX_RENDERED_MEDIA_LINKS = 20;

export interface RenderedMediaLinks {
  readonly shown: readonly NoticeLink[];
  /** How many links were left out. */
  readonly hidden: number;
}

export function renderedMediaLinks(media: readonly NoticeLink[]): RenderedMediaLinks {
  return { shown: media.slice(0, MAX_RENDERED_MEDIA_LINKS), hidden: Math.max(0, media.length - MAX_RENDERED_MEDIA_LINKS) };
}

export function hiddenLinksText(hidden: number): string {
  return `and ${hidden} more in the cockpit`;
}
