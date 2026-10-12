export type PathSegment = string | number;
export type JsonPath = readonly PathSegment[];

export const ROOT_PATH: JsonPath = [];

const ROOT_DESCRIPTION = 'the document';
const FIELD_SEPARATOR = '.';

export function childOf(path: JsonPath, segment: PathSegment): JsonPath {
  return [...path, segment];
}

export function formatPath(path: JsonPath): string {
  return path.length === 0 ? ROOT_DESCRIPTION : path.map(formatSegment).join('');
}

function formatSegment(segment: PathSegment, position: number): string {
  if (typeof segment === 'number') {
    return `[${String(segment)}]`;
  }
  return position === 0 ? segment : `${FIELD_SEPARATOR}${segment}`;
}
