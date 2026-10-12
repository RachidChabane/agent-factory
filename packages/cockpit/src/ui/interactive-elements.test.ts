import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = join(process.cwd(), 'src');
const BUTTON_TAGS: ReadonlySet<string> = new Set(['button', 'Button', 'IconButton']);
const LINK_TAGS: ReadonlySet<string> = new Set(['a', 'Link', 'NavLink']);
const HANDLER = 'onClick';
const DESTINATIONS: readonly string[] = ['href', 'to'];
const PLACEHOLDER_DESTINATIONS: ReadonlySet<string> = new Set(['#', '']);
const SUBMIT_TYPE = 'submit';

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly tag: string;
}

function componentFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'test' ? [] : componentFiles(path);
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : [];
  });
}

function attributeNamed(attributes: ts.JsxAttributes, name: string): ts.JsxAttribute | undefined {
  return attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name);
}

function isSubmitButton(attributes: ts.JsxAttributes): boolean {
  const type = attributeNamed(attributes, 'type');
  return type?.initializer !== undefined && ts.isStringLiteral(type.initializer) && type.initializer.text === SUBMIT_TYPE;
}

/** A button that carries no handler, is not a submit button and passes no props on: a button that cannot do what its label says. */
function findHandlerlessButtons(path: string, text: string = readFileSync(path, 'utf8')): Finding[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const check = (node: ts.JsxOpeningLikeElement) => {
    const tag = node.tagName.getText(source);
    if (!BUTTON_TAGS.has(tag)) return;
    const { attributes } = node;
    const forwardsProps = attributes.properties.some((property) => ts.isJsxSpreadAttribute(property));
    if (forwardsProps || attributeNamed(attributes, HANDLER) !== undefined || isSubmitButton(attributes)) return;
    findings.push({ file: relative(SOURCE_ROOT, path), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, tag });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) check(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

/** A link without a destination, or whose destination is a placeholder: a link that leads nowhere. */
function findDestinationlessLinks(path: string, text: string = readFileSync(path, 'utf8')): Finding[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const check = (node: ts.JsxOpeningLikeElement) => {
    const tag = node.tagName.getText(source);
    if (!LINK_TAGS.has(tag)) return;
    const { attributes } = node;
    if (attributes.properties.some((property) => ts.isJsxSpreadAttribute(property))) return;
    const destination = DESTINATIONS.map((name) => attributeNamed(attributes, name)).find((attribute) => attribute !== undefined);
    const literal = destination?.initializer !== undefined && ts.isStringLiteral(destination.initializer) ? destination.initializer.text : null;
    if (destination !== undefined && (literal === null || !PLACEHOLDER_DESTINATIONS.has(literal))) return;
    findings.push({ file: relative(SOURCE_ROOT, path), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, tag });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) check(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

const describeFindings = (findings: readonly Finding[]) => findings.map((finding) => `${finding.file}:${finding.line} <${finding.tag}>`);

describe('links', () => {
  it('always lead somewhere', () => {
    const findings = componentFiles(SOURCE_ROOT).flatMap((path) => findDestinationlessLinks(path));
    expect(describeFindings(findings)).toEqual([]);
  });

  it('are found when one has no destination or a placeholder', () => {
    const sample = [
      'export const a = () => <a>Docs</a>;',
      'export const b = () => <a href="#">Docs</a>;',
      'export const c = () => <Link to="">Docs</Link>;',
      'export const d = () => <a href="https://example.com/docs">Docs</a>;',
      'export const e = (path: string) => <Link to={path}>Docs</Link>;',
      'export const f = (props: object) => <a {...props}>Docs</a>;',
    ].join('\n');
    const found = findDestinationlessLinks(join(SOURCE_ROOT, 'sample.tsx'), sample);
    expect(describeFindings(found)).toEqual(['sample.tsx:1 <a>', 'sample.tsx:2 <a>', 'sample.tsx:3 <Link>']);
  });
});

describe('buttons', () => {
  it('always carry the handler that does what their label says', () => {
    const findings = componentFiles(SOURCE_ROOT).flatMap((path) => findHandlerlessButtons(path));
    expect(describeFindings(findings)).toEqual([]);
  });

  it('are found when one has no handler', () => {
    const sample = [
      'export const a = () => <button type="button">Save</button>;',
      'export const b = () => <Button variant="primary">Save</Button>;',
      'export const c = () => <IconButton label="Close" icon={null} />;',
      'export const d = () => <button type="button" onClick={() => undefined}>Save</button>;',
      'export const e = () => <button type="submit">Save</button>;',
      'export const f = (props: object) => <button {...props}>Save</button>;',
    ].join('\n');
    const found = findHandlerlessButtons(join(SOURCE_ROOT, 'sample.tsx'), sample);
    expect(describeFindings(found)).toEqual(['sample.tsx:1 <button>', 'sample.tsx:2 <Button>', 'sample.tsx:3 <IconButton>']);
  });
});
