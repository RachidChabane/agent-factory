import { parse, stringify } from 'yaml';

const DELIMITER_LINE = '---\n';
const CLOSING_DELIMITER = '\n---\n';
const SEPARATOR = '\n';

export class FrontMatterMissingError extends Error {
  constructor() {
    super(`the document does not start with a "---" front matter block`);
    this.name = 'FrontMatterMissingError';
  }
}

export interface FrontMatterDocument {
  readonly data: unknown;
  readonly body: string;
}

export function renderFrontMatter(data: unknown, body: string): string {
  return `${DELIMITER_LINE}${stringify(data)}${DELIMITER_LINE}${SEPARATOR}${body}`;
}

export function parseFrontMatter(text: string): FrontMatterDocument {
  if (!text.startsWith(DELIMITER_LINE)) throw new FrontMatterMissingError();
  const closing = text.indexOf(CLOSING_DELIMITER, DELIMITER_LINE.length - SEPARATOR.length);
  if (closing === -1) throw new FrontMatterMissingError();
  const yamlText = text.slice(DELIMITER_LINE.length, closing + SEPARATOR.length);
  const rest = text.slice(closing + CLOSING_DELIMITER.length);
  return { data: parse(yamlText), body: rest.startsWith(SEPARATOR) ? rest.slice(SEPARATOR.length) : rest };
}
