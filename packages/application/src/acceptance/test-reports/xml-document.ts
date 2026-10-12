export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  readonly text: string;
}

export class XmlFormatError extends Error {
  constructor(detail: string) {
    super(`not a well-formed XML document: ${detail}`);
    this.name = 'XmlFormatError';
  }
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const ENTITY = /&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g;
const ATTRIBUTE = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const TAG_NAME = /^[A-Za-z_:][\w:.-]*/;
const HEXADECIMAL_PREFIX = '#x';
const DECIMAL_PREFIX = '#';
const HEXADECIMAL = 16;
const DECIMAL = 10;

const SKIPPED_SECTIONS: readonly (readonly [string, string])[] = [
  ['<?', '?>'],
  ['<!--', '-->'],
  ['<!DOCTYPE', '>'],
];
const CDATA_START = '<![CDATA[';
const CDATA_END = ']]>';
const CLOSING_TAG_START = '</';
const TAG_START = '<';
const TAG_END = '>';
const SELF_CLOSING_END = '/';

export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, entity: string) => {
    if (entity.startsWith(HEXADECIMAL_PREFIX)) return String.fromCodePoint(Number.parseInt(entity.slice(HEXADECIMAL_PREFIX.length), HEXADECIMAL));
    if (entity.startsWith(DECIMAL_PREFIX)) return String.fromCodePoint(Number.parseInt(entity.slice(DECIMAL_PREFIX.length), DECIMAL));
    return NAMED_ENTITIES[entity] ?? whole;
  });
}

interface OpenElement {
  readonly name: string;
  readonly attributes: Record<string, string>;
  readonly children: XmlElement[];
  text: string;
}

function attributesOf(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    const [, name, doubleQuoted, singleQuoted] = match;
    if (name !== undefined) attributes[name] = decodeEntities(doubleQuoted ?? singleQuoted ?? '');
  }
  return attributes;
}

function closeElement(open: OpenElement): XmlElement {
  return { name: open.name, attributes: open.attributes, children: open.children, text: open.text };
}

const QUOTES: readonly string[] = ['"', "'"];

function tagEnd(text: string, from: number): number {
  let quote: string | null = null;
  for (let index = from; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if (QUOTES.includes(character)) {
      quote = character;
    } else if (character === TAG_END) {
      return index;
    }
  }
  throw new XmlFormatError(`"${TAG_END}" expected after offset ${from}`);
}

function endOf(text: string, marker: string, from: number): number {
  const end = text.indexOf(marker, from);
  if (end === -1) throw new XmlFormatError(`"${marker}" expected after offset ${from}`);
  return end;
}

export function parseXml(text: string): XmlElement {
  const stack: OpenElement[] = [];
  let root: XmlElement | null = null;
  let index = 0;
  const appendText = (value: string): void => {
    const current = stack.at(-1);
    if (current !== undefined) current.text += value;
  };
  while (index < text.length) {
    const skipped = SKIPPED_SECTIONS.find(([start]) => text.startsWith(start, index));
    if (skipped !== undefined) {
      index = endOf(text, skipped[1], index) + skipped[1].length;
      continue;
    }
    if (text.startsWith(CDATA_START, index)) {
      const end = endOf(text, CDATA_END, index);
      appendText(text.slice(index + CDATA_START.length, end));
      index = end + CDATA_END.length;
      continue;
    }
    if (text.startsWith(CLOSING_TAG_START, index)) {
      const end = endOf(text, TAG_END, index);
      const name = text.slice(index + CLOSING_TAG_START.length, end).trim();
      const open = stack.pop();
      if (open === undefined || open.name !== name) throw new XmlFormatError(`unexpected closing tag </${name}>`);
      const element = closeElement(open);
      const parent = stack.at(-1);
      if (parent === undefined) root = element;
      else parent.children.push(element);
      index = end + TAG_END.length;
      continue;
    }
    if (text.startsWith(TAG_START, index)) {
      const end = tagEnd(text, index);
      const body = text.slice(index + TAG_START.length, end);
      const selfClosing = body.trimEnd().endsWith(SELF_CLOSING_END);
      const content = selfClosing ? body.trimEnd().slice(0, -SELF_CLOSING_END.length) : body;
      const name = TAG_NAME.exec(content)?.[0];
      if (name === undefined) throw new XmlFormatError(`invalid tag at offset ${index}`);
      const open: OpenElement = { name, attributes: attributesOf(content.slice(name.length)), children: [], text: '' };
      if (selfClosing) {
        const parent = stack.at(-1);
        if (parent === undefined) root = closeElement(open);
        else parent.children.push(closeElement(open));
      } else {
        stack.push(open);
      }
      index = end + TAG_END.length;
      continue;
    }
    const next = text.indexOf(TAG_START, index);
    const end = next === -1 ? text.length : next;
    appendText(decodeEntities(text.slice(index, end)));
    index = end;
  }
  if (stack.length > 0) throw new XmlFormatError(`<${stack.at(-1)?.name ?? ''}> is never closed`);
  if (root === null) throw new XmlFormatError('no root element');
  return root;
}

export function descendants(element: XmlElement, name: string): readonly XmlElement[] {
  return element.children.flatMap((child) => [...(child.name === name ? [child] : []), ...descendants(child, name)]);
}
