export const REQUEST_ID_PREFIX = 'req-';
export const REQUEST_FILE_NAME = 'request.md';
export const REQUEST_IMAGES_DIRECTORY = 'images';
export const REQUEST_SPECS_DIRECTORY = 'specs';
export const REQUEST_REPORT_FILE_NAME = 'report.md';
export const REQUEST_REPLY_FILE_NAME = 'reply.md';
export const ITEM_ID_PREFIX = 'item-';
export const SPEC_ID_PREFIX = 'spec-';
export const FILE_PATH_SEPARATOR = '/';

export function nextRequestId(existingCount: number): string {
  return `${REQUEST_ID_PREFIX}${existingCount + 1}`;
}

export function itemId(number: number): string {
  return `${ITEM_ID_PREFIX}${number}`;
}

export function specId(number: number): string {
  return `${SPEC_ID_PREFIX}${number}`;
}

export function imagePath(name: string): string {
  return `${REQUEST_IMAGES_DIRECTORY}${FILE_PATH_SEPARATOR}${name}`;
}
