const LINE_BREAK = /\r\n?/g;
const NEWLINE = '\n';
const LEVEL_TWO_HEADING = /^ {0,3}##(?!#)(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE_OPENING = /^ {0,3}(`{3,}|~{3,})/;
const NUMBERED_ITEM = /^ {0,3}\d{1,9}[.)](?:[ \t]+(.*))?$/;
const BULLET_ITEM = /^ {0,3}[-*+](?:[ \t]+(.*))?$/;
const CONTINUATION_LINE = /^[ \t]+\S/;

export interface MarkdownSection {
  readonly heading: string;
  readonly lines: readonly string[];
}

export interface MarkdownDocument {
  readonly preamble: readonly string[];
  readonly sections: readonly MarkdownSection[];
}

export function splitLines(text: string): string[] {
  return text.replace(LINE_BREAK, NEWLINE).split(NEWLINE);
}

export function splitLevelTwoSections(body: string): MarkdownDocument {
  const preamble: string[] = [];
  const sections: { heading: string; lines: string[] }[] = [];
  let openFence: string | null = null;
  for (const line of splitLines(body)) {
    const fence = FENCE_OPENING.exec(line)?.[1] ?? null;
    if (openFence === null) {
      const heading = LEVEL_TWO_HEADING.exec(line);
      if (heading !== null) {
        sections.push({ heading: heading[1] ?? '', lines: [] });
        continue;
      }
      if (fence !== null) openFence = fence;
    } else if (fence !== null && fence.startsWith(openFence) && line.trim() === fence) {
      openFence = null;
    }
    const current = sections.at(-1);
    if (current === undefined) preamble.push(line);
    else current.lines.push(line);
  }
  return { preamble, sections };
}

export function blockText(lines: readonly string[]): string {
  return lines.join(NEWLINE).trim();
}

export function isBlank(lines: readonly string[]): boolean {
  return blockText(lines) === '';
}

export const LIST_KINDS = ['numbered', 'bullet'] as const;
export type ListKind = (typeof LIST_KINDS)[number];

const ITEM_PATTERN: Readonly<Record<ListKind, RegExp>> = {
  numbered: NUMBERED_ITEM,
  bullet: BULLET_ITEM,
};

export type ListParse =
  | { readonly kind: 'list'; readonly items: readonly string[] }
  | { readonly kind: 'not-a-list'; readonly offendingLine: string }
  | { readonly kind: 'empty-item'; readonly itemNumber: number };

export function parseList(lines: readonly string[], kind: ListKind): ListParse {
  const items: string[][] = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    const item = ITEM_PATTERN[kind].exec(line);
    if (item !== null) {
      items.push([(item[1] ?? '').trim()]);
      continue;
    }
    const current = items.at(-1);
    if (current === undefined || !CONTINUATION_LINE.test(line)) return { kind: 'not-a-list', offendingLine: line.trim() };
    current.push(line.trim());
  }
  const joined = items.map((parts) => parts.filter((part) => part !== '').join(' '));
  const emptyIndex = joined.findIndex((item) => item === '');
  if (emptyIndex !== -1) return { kind: 'empty-item', itemNumber: emptyIndex + 1 };
  return { kind: 'list', items: joined };
}
