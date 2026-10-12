import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = join(process.cwd(), 'src');
const USER_FACING_ATTRIBUTES: ReadonlySet<string> = new Set(['aria-label', 'aria-description', 'aria-placeholder', 'aria-valuetext', 'title', 'placeholder', 'alt', 'label']);
const USER_FACING_PROPERTIES: ReadonlySet<string> = new Set(['label', 'title', 'description', 'placeholder', 'hint', 'accessibleLabel', 'confirmLabel', 'empty', 'emptyMessage']);
/** Symbols and product marks that read the same in every language. */
const LANGUAGE_NEUTRAL: ReadonlySet<string> = new Set(['⌘K', 'EN', 'FR', 'report.md']);
const LETTER = /\p{L}/u;

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'test' || entry === 'catalog' ? [] : sourceFiles(path);
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : [];
  });
}

function isUserText(text: string): boolean {
  const trimmed = text.trim();
  return LETTER.test(trimmed) && !LANGUAGE_NEUTRAL.has(trimmed);
}

function findHardCodedText(path: string): Finding[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const report = (node: ts.Node, text: string) => {
    findings.push({ file: relative(SOURCE_ROOT, path), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text: text.trim() });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && isUserText(node.text)) report(node, node.text);
    if (ts.isJsxAttribute(node) && node.initializer !== undefined && ts.isStringLiteral(node.initializer)) {
      if (USER_FACING_ATTRIBUTES.has(node.name.getText(source)) && isUserText(node.initializer.text)) report(node, node.initializer.text);
    }
    if (ts.isPropertyAssignment(node) && ts.isStringLiteralLike(node.initializer) && USER_FACING_PROPERTIES.has(node.name.getText(source))) {
      if (isUserText(node.initializer.text)) report(node, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

/** What a reader cannot tell from "unknown", "none" and "not applicable": a mark that stands for a missing value. */
const PLACEHOLDER_MARKS: ReadonlySet<string> = new Set(['—', '–', '-', '--', '...', '…', 'n/a', 'N/A', 'NA', '?']);

function sourceFilesOfAnyKind(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'test' || entry === 'catalog' ? [] : sourceFilesOfAnyKind(path);
    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

function findPlaceholders(path: string): Finding[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings: Finding[] = [];
  const report = (node: ts.Node, text: string) => {
    findings.push({ file: relative(SOURCE_ROOT, path), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && PLACEHOLDER_MARKS.has(node.text.trim())) report(node, node.text.trim());
    if (ts.isJsxExpression(node) && node.expression !== undefined && ts.isStringLiteralLike(node.expression) && PLACEHOLDER_MARKS.has(node.expression.text)) report(node, node.expression.text);
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      if (ts.isStringLiteralLike(node.right) && PLACEHOLDER_MARKS.has(node.right.text)) report(node, node.right.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

describe('components', () => {
  it('stand no mark in for a missing value: every empty value says why it is empty', () => {
    const findings = sourceFilesOfAnyKind(SOURCE_ROOT).flatMap(findPlaceholders);
    expect(findings.map((finding) => `${finding.file}:${finding.line} ${JSON.stringify(finding.text)}`)).toEqual([]);
  });

  it('hold no hard-coded user-facing text: every string comes from the catalogs', () => {
    const findings = sourceFiles(SOURCE_ROOT).flatMap(findHardCodedText);
    expect(findings.map((finding) => `${finding.file}:${finding.line} ${JSON.stringify(finding.text)}`)).toEqual([]);
  });
});
