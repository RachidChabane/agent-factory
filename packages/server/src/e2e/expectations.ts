import { hangingIndent, joinItems, LINE_SEPARATOR } from './format.ts';

const DETAIL_INDENT = '  ';
const EXPECTED_LABEL = 'expected: ';
const FOUND_LABEL = 'found:    ';
const NO_ITEMS = '(none)';

/** What a step of the run expected and what it found instead; the run reports both and stops. */
export class ExpectationFailed extends Error {
  readonly what: string;
  readonly expected: string;
  readonly found: string;

  constructor(what: string, expected: string, found: string) {
    super([what, labelled(EXPECTED_LABEL, expected), labelled(FOUND_LABEL, found)].join(LINE_SEPARATOR));
    this.name = 'ExpectationFailed';
    this.what = what;
    this.expected = expected;
    this.found = found;
  }
}

function labelled(label: string, text: string): string {
  return `${DETAIL_INDENT}${label}${hangingIndent(text, ' '.repeat(DETAIL_INDENT.length + label.length))}`;
}

function listed(items: readonly string[]): string {
  return items.length === 0 ? NO_ITEMS : joinItems(items);
}

export function expectThat(holds: boolean, what: string, expected: string, found: string): void {
  if (!holds) throw new ExpectationFailed(what, expected, found);
}

export function expectEqual(what: string, expected: string | number | boolean, found: string | number | boolean): void {
  expectThat(expected === found, what, String(expected), String(found));
}

export function expectContains(what: string, fragment: string, text: string): void {
  expectThat(text.includes(fragment), what, `a text containing ${JSON.stringify(fragment)}`, text);
}

export function expectMatch(what: string, pattern: RegExp, text: string): RegExpExecArray {
  const match = pattern.exec(text);
  if (match === null) throw new ExpectationFailed(what, `a text matching ${String(pattern)}`, text);
  return match;
}

export function expectSameItems(what: string, expected: readonly string[], found: readonly string[]): void {
  expectThat(expected.length === found.length && expected.every((item, position) => item === found[position]), what, listed(expected), listed(found));
}

export function expectIncludesAll(what: string, expected: readonly string[], found: readonly string[]): void {
  const missing = expected.filter((item) => !found.includes(item));
  expectThat(missing.length === 0, what, `${listed(expected)} among the items`, `${listed(found)}; missing ${listed(missing)}`);
}
