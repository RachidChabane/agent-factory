const BACKTICK_RUN = /`+/g;
const MINIMUM_FENCE_LENGTH = 3;
const BACKTICK = '`';
const NEWLINE = '\n';

export function fenced(content: string, info: string = ''): string {
  const longestRun = Math.max(0, ...[...content.matchAll(BACKTICK_RUN)].map((match) => match[0].length));
  const fence = BACKTICK.repeat(Math.max(MINIMUM_FENCE_LENGTH, longestRun + 1));
  return `${fence}${info}${NEWLINE}${content.replace(/\n$/, '')}${NEWLINE}${fence}`;
}

export function inlineCode(text: string): string {
  const longestRun = Math.max(0, ...[...text.matchAll(BACKTICK_RUN)].map((match) => match[0].length));
  const ticks = BACKTICK.repeat(longestRun + 1);
  const padding = longestRun > 0 ? ' ' : '';
  return `${ticks}${padding}${text}${padding}${ticks}`;
}

const TABLE_CELL_SEPARATOR = /\|/g;
const ESCAPED_TABLE_CELL_SEPARATOR = '\\|';

export function tableCell(text: string): string {
  return text.replace(TABLE_CELL_SEPARATOR, ESCAPED_TABLE_CELL_SEPARATOR);
}
