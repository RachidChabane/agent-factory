import { isMap, isScalar, parseDocument, type Document, type YAMLMap } from 'yaml';
import { dailyCapOf, type SettingsChange } from '@agent-factory/domain';

export const CONFIG_KEYS = {
  roles: 'roles',
  model: 'model',
  effort: 'effort',
  maxBudgetUsd: 'maxBudgetUsd',
  maxTurns: 'maxTurns',
  concurrency: 'concurrency',
  concurrentIssues: 'issues',
  resources: 'resources',
  minimumFreeMemoryPercent: 'minimumFreeMemoryPercent',
  pauseAbovePressure: 'pauseAbovePressure',
  budget: 'budget',
  dailyCapUsd: 'dailyCapUsd',
  perRunCapUsd: 'perRunCapUsd',
  sevenDayPauseUtilization: 'sevenDayPauseUtilization',
} as const;

const PLAIN_SCALAR = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NULL_SCALAR = 'null';
const NEWLINE = '\n';
const SPACE = ' ';
const FLOW_SEPARATOR = ', ';
const KEY_SEPARATOR = ': ';
const BLOCK_INDENT = '  ';

type ScalarValue = string | number | null;

interface Assignment {
  readonly path: readonly string[];
  readonly value: ScalarValue;
}

interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export class ConfigEditRefusedError extends Error {
  constructor(reason: string) {
    super(`The configuration cannot be edited: ${reason}`);
    this.name = 'ConfigEditRefusedError';
  }
}

function assignments(document: Document, change: SettingsChange): readonly Assignment[] {
  const keys = CONFIG_KEYS;
  switch (change.kind) {
    case 'role':
      if (!document.hasIn([keys.roles, change.role])) throw new ConfigEditRefusedError(`roles.${change.role} is not configured`);
      return [
        { path: [keys.roles, change.role, keys.model], value: change.model.trim() },
        { path: [keys.roles, change.role, keys.effort], value: change.effort },
        { path: [keys.roles, change.role, keys.maxBudgetUsd], value: change.maxBudgetUsd },
        { path: [keys.roles, change.role, keys.maxTurns], value: change.maxTurns },
      ];
    case 'limits':
      return [
        { path: [keys.concurrency, keys.concurrentIssues], value: change.concurrentIssues },
        { path: [keys.resources, keys.minimumFreeMemoryPercent], value: change.minimumFreeMemoryPercent },
        { path: [keys.resources, keys.pauseAbovePressure], value: change.pauseAbovePressure },
      ];
    case 'caps':
      return [
        { path: [keys.budget, keys.dailyCapUsd], value: dailyCapOf(change.dailyCapUsd) },
        { path: [keys.budget, keys.perRunCapUsd], value: change.perRunCapUsd },
        { path: [keys.budget, keys.sevenDayPauseUtilization], value: change.pauseAtUtilization },
      ];
  }
}

function scalarText(value: ScalarValue): string {
  if (value === null) return NULL_SCALAR;
  if (typeof value === 'number') return String(value);
  return PLAIN_SCALAR.test(value) ? value : JSON.stringify(value);
}

function pairText(key: string, value: ScalarValue): string {
  return `${key}${KEY_SEPARATOR}${scalarText(value)}`;
}

function inPlaceEdit(document: Document, assignment: Assignment): TextEdit | null {
  const node = document.getIn(assignment.path, true);
  if (!isScalar(node) || node.range === null || node.range === undefined) return null;
  return { start: node.range[0], end: node.range[1], text: scalarText(assignment.value) };
}

function lastKey(assignment: Assignment): string {
  const key = assignment.path.at(-1);
  if (key === undefined) throw new ConfigEditRefusedError('an empty key path');
  return key;
}

function lineStartBefore(text: string, offset: number): number {
  return text.lastIndexOf(NEWLINE, offset - 1) + 1;
}

function flowInsertion(text: string, map: YAMLMap, missing: readonly Assignment[]): TextEdit {
  const range = map.range;
  if (range === null || range === undefined) throw new ConfigEditRefusedError('a map without a source position');
  let end = range[1] - 1;
  while (end > range[0] && text[end - 1] === SPACE) end -= 1;
  const pairs = missing.map((assignment) => pairText(lastKey(assignment), assignment.value));
  const prefix = map.items.length === 0 ? '' : FLOW_SEPARATOR;
  return { start: end, end, text: `${prefix}${pairs.join(FLOW_SEPARATOR)}` };
}

function blockInsertion(text: string, map: YAMLMap, missing: readonly Assignment[]): TextEdit {
  const first = map.items[0];
  const last = map.items.at(-1);
  const firstKey = isScalar(first?.key) ? first.key.range : null;
  const lastRange = isScalar(last?.value) || isMap(last?.value) ? last.value.range : isScalar(last?.key) ? last.key.range : null;
  if (firstKey === null || firstKey === undefined || lastRange === null || lastRange === undefined) {
    throw new ConfigEditRefusedError('a map whose layout cannot be extended in place');
  }
  const indent = text.slice(lineStartBefore(text, firstKey[0]), firstKey[0]);
  const lines = missing.map((assignment) => `${indent}${pairText(lastKey(assignment), assignment.value)}`);
  const valueEnd = lastRange[1];
  if (text[valueEnd - 1] === NEWLINE) return { start: valueEnd, end: valueEnd, text: `${lines.join(NEWLINE)}${NEWLINE}` };
  const lineEnd = text.indexOf(NEWLINE, valueEnd);
  const at = lineEnd === -1 ? text.length : lineEnd;
  return { start: at, end: at, text: `${NEWLINE}${lines.join(NEWLINE)}` };
}

function sectionAppend(text: string, section: string, missing: readonly Assignment[]): TextEdit {
  const lines = missing.map((assignment) => `${BLOCK_INDENT}${pairText(lastKey(assignment), assignment.value)}`);
  const separator = text.endsWith(NEWLINE) ? '' : NEWLINE;
  return { start: text.length, end: text.length, text: `${separator}${section}:${NEWLINE}${lines.join(NEWLINE)}${NEWLINE}` };
}

function insertion(text: string, document: Document, parent: readonly string[], missing: readonly Assignment[]): TextEdit {
  const node = document.getIn(parent, true);
  if (isMap(node)) return node.flow === true ? flowInsertion(text, node, missing) : blockInsertion(text, node, missing);
  const section = parent[0];
  if (node === undefined && parent.length === 1 && section !== undefined) return sectionAppend(text, section, missing);
  throw new ConfigEditRefusedError(`${parent.join('.')} is not a map`);
}

function parentKey(assignment: Assignment): string {
  return assignment.path.slice(0, -1).join('.');
}

function applyEdits(text: string, edits: readonly TextEdit[]): string {
  return [...edits].sort((left, right) => right.start - left.start).reduce((result, edit) => `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`, text);
}

export function editConfigText(text: string, change: SettingsChange): string {
  const document = parseDocument(text);
  if (document.errors.length > 0) {
    throw new ConfigEditRefusedError(`it does not parse (${document.errors.map((error) => error.message.split(NEWLINE)[0] ?? '').join('; ')})`);
  }
  const edits: TextEdit[] = [];
  const missing = new Map<string, Assignment[]>();
  for (const assignment of assignments(document, change)) {
    const edit = inPlaceEdit(document, assignment);
    if (edit !== null) edits.push(edit);
    else missing.set(parentKey(assignment), [...(missing.get(parentKey(assignment)) ?? []), assignment]);
  }
  for (const group of missing.values()) {
    const sample = group[0];
    if (sample !== undefined) edits.push(insertion(text, document, sample.path.slice(0, -1), group));
  }
  return applyEdits(text, edits);
}
