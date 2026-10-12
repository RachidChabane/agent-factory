const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_DECIMALS = 1;
const SHORT_SHA_LENGTH = 7;
const ITEM_SEPARATOR = ', ';
const WORD_SEPARATOR = ' ';

export const LINE_SEPARATOR = '\n';

export function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / MILLISECONDS_PER_SECOND).toFixed(SECONDS_DECIMALS)} s`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

/** Items written one after the other on a line. */
export function joinItems(items: readonly string[]): string {
  return items.join(ITEM_SEPARATOR);
}

/** Words written one after the other, as a command is typed. */
export function joinWords(words: readonly string[]): string {
  return words.join(WORD_SEPARATOR);
}

/** The last `count` lines of a text, which is where a command says why it stopped. */
export function lastLines(text: string, count: number): string {
  return text.split(LINE_SEPARATOR).slice(-count).join(LINE_SEPARATOR);
}

/** Puts every line of a text but the first behind `margin`, so a multi-line value reads as one block after its label. */
export function hangingIndent(text: string, margin: string): string {
  const [first = '', ...rest] = text.split(LINE_SEPARATOR);
  return [first, ...rest.map((line) => `${margin}${line}`)].join(LINE_SEPARATOR);
}
