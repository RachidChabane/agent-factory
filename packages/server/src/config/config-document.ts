import { isMap, isScalar, isSeq, parseDocument, type Document, type YAMLMap } from 'yaml';
import type { SettingsChange } from '@agent-factory/domain';
import { NONE } from './schema/common.ts';

export const CONFIG_KEYS = {
  defaults: 'defaults',
  projects: 'projects',
  id: 'id',
  roles: 'roles',
  model: 'model',
  effort: 'effort',
  maxBudgetUsd: 'maxBudgetUsd',
  maxTurns: 'maxTurns',
  concurrency: 'concurrency',
  issues: 'issues',
  ceiling: 'ceiling',
  resources: 'resources',
  minimumFreeMemoryPercent: 'minimumFreeMemoryPercent',
  pauseAbovePressure: 'pauseAbovePressure',
  maxConcurrentRuns: 'maxConcurrentRuns',
  budget: 'budget',
  dailyCapUsd: 'dailyCapUsd',
  perRunCapUsd: 'perRunCapUsd',
} as const;

const PLAIN_SCALAR = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NEWLINE = '\n';
const SPACE = ' ';
const SEQUENCE_DASH = /-/g;
const FLOW_SEPARATOR = ', ';
const KEY_SEPARATOR = ': ';
const BLOCK_INDENT = '  ';

type ScalarValue = string | number;
type PathSegment = string | number;

interface Assignment {
  readonly path: readonly PathSegment[];
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

function projectIndex(document: Document, project: string): number {
  const projects = document.get(CONFIG_KEYS.projects, true);
  if (!isSeq(projects)) throw new ConfigEditRefusedError('it declares no projects');
  const index = projects.items.findIndex((item) => isMap(item) && item.get(CONFIG_KEYS.id) === project);
  if (index === -1) throw new ConfigEditRefusedError(`it declares no project ${project}`);
  return index;
}

function rolePath(document: Document, project: string | null, role: string): readonly PathSegment[] {
  return project === null ? [CONFIG_KEYS.defaults, CONFIG_KEYS.roles, role] : [CONFIG_KEYS.projects, projectIndex(document, project), CONFIG_KEYS.roles, role];
}

function assignments(document: Document, change: SettingsChange): readonly Assignment[] {
  const keys = CONFIG_KEYS;
  switch (change.kind) {
    case 'role': {
      const role = rolePath(document, change.project, change.role);
      return [
        { path: [...role, keys.model], value: change.model.trim() },
        { path: [...role, keys.effort], value: change.effort },
        { path: [...role, keys.maxBudgetUsd], value: change.maxBudgetUsd },
        { path: [...role, keys.maxTurns], value: change.maxTurns },
      ];
    }
    case 'resources':
      return [
        { path: [keys.resources, keys.minimumFreeMemoryPercent], value: change.minimumFreeMemoryPercent },
        { path: [keys.resources, keys.pauseAbovePressure], value: change.pauseAbovePressure },
        { path: [keys.resources, keys.maxConcurrentRuns], value: change.maxConcurrentRuns },
      ];
    case 'budget':
      return [
        { path: [keys.budget, keys.dailyCapUsd], value: change.dailyCap.kind === 'none' ? NONE : change.dailyCap.amount },
        { path: [keys.budget, keys.perRunCapUsd], value: change.perRunCapUsd ?? NONE },
      ];
    case 'concurrency': {
      const concurrency = [keys.projects, projectIndex(document, change.project), keys.concurrency];
      return [
        { path: [...concurrency, keys.issues], value: change.issues },
        { path: [...concurrency, keys.ceiling], value: change.ceiling },
      ];
    }
  }
}

function scalarText(value: ScalarValue): string {
  if (typeof value === 'number') return String(value);
  return PLAIN_SCALAR.test(value) ? value : JSON.stringify(value);
}

function pairText(key: PathSegment, value: ScalarValue): string {
  return `${key}${KEY_SEPARATOR}${scalarText(value)}`;
}

function inPlaceEdit(document: Document, assignment: Assignment): TextEdit | null {
  const node = document.getIn(assignment.path, true);
  if (!isScalar(node) || node.range === null || node.range === undefined) return null;
  return { start: node.range[0], end: node.range[1], text: scalarText(assignment.value) };
}

function lastKey(assignment: Assignment): PathSegment {
  const key = assignment.path.at(-1);
  if (key === undefined) throw new ConfigEditRefusedError('an empty key path');
  return key;
}

function lineStartBefore(text: string, offset: number): number {
  return text.lastIndexOf(NEWLINE, offset - 1) + 1;
}

/** The lines that create the missing keys, then the assignments under the last of them. */
function nestedLines(indent: string, missingKeys: readonly PathSegment[], group: readonly Assignment[]): readonly string[] {
  const keyLines = missingKeys.map((key, depth) => `${indent}${BLOCK_INDENT.repeat(depth)}${key}:`);
  const leafIndent = `${indent}${BLOCK_INDENT.repeat(missingKeys.length)}`;
  return [...keyLines, ...group.map((assignment) => `${leafIndent}${pairText(lastKey(assignment), assignment.value)}`)];
}

function flowInsertion(text: string, map: YAMLMap, group: readonly Assignment[]): TextEdit {
  const range = map.range;
  if (range === null || range === undefined) throw new ConfigEditRefusedError('a map without a source position');
  let end = range[1] - 1;
  while (end > range[0] && text[end - 1] === SPACE) end -= 1;
  const pairs = group.map((assignment) => pairText(lastKey(assignment), assignment.value));
  const prefix = map.items.length === 0 ? '' : FLOW_SEPARATOR;
  return { start: end, end, text: `${prefix}${pairs.join(FLOW_SEPARATOR)}` };
}

function blockInsertion(text: string, map: YAMLMap, missingKeys: readonly PathSegment[], group: readonly Assignment[]): TextEdit {
  const first = map.items[0];
  const last = map.items.at(-1);
  const firstKey = isScalar(first?.key) ? first.key.range : null;
  const lastValue = last?.value;
  const lastRange = isScalar(lastValue) || isMap(lastValue) || isSeq(lastValue) ? lastValue.range : isScalar(last?.key) ? last.key.range : null;
  if (firstKey === null || firstKey === undefined || lastRange === null || lastRange === undefined) {
    throw new ConfigEditRefusedError('a map whose layout cannot be extended in place');
  }
  const indent = text.slice(lineStartBefore(text, firstKey[0]), firstKey[0]).replace(SEQUENCE_DASH, SPACE);
  const lines = nestedLines(indent, missingKeys, group);
  const valueEnd = lastRange[1];
  if (text[valueEnd - 1] === NEWLINE) return { start: valueEnd, end: valueEnd, text: `${lines.join(NEWLINE)}${NEWLINE}` };
  const lineEnd = text.indexOf(NEWLINE, valueEnd);
  const at = lineEnd === -1 ? text.length : lineEnd;
  return { start: at, end: at, text: `${NEWLINE}${lines.join(NEWLINE)}` };
}

function documentAppend(text: string, missingKeys: readonly PathSegment[], group: readonly Assignment[]): TextEdit {
  const separator = text.endsWith(NEWLINE) ? '' : NEWLINE;
  return { start: text.length, end: text.length, text: `${separator}${nestedLines('', missingKeys, group).join(NEWLINE)}${NEWLINE}` };
}

/** Inserts a group of assignments sharing one parent, creating the parent's missing ancestors in the file's own layout. */
function insertion(text: string, document: Document, parent: readonly PathSegment[], group: readonly Assignment[]): TextEdit {
  for (let depth = parent.length; depth >= 0; depth -= 1) {
    const existing = parent.slice(0, depth);
    const missingKeys = parent.slice(depth);
    if (missingKeys.some((key) => typeof key === 'number')) continue;
    if (depth === 0) return documentAppend(text, missingKeys, group);
    const node = document.getIn(existing, true);
    if (node === undefined) continue;
    if (!isMap(node)) throw new ConfigEditRefusedError(`${existing.join('.')} is not a map`);
    if (node.flow === true) {
      if (missingKeys.length > 0) throw new ConfigEditRefusedError(`${existing.join('.')} is written inline; add ${missingKeys.join('.')} by hand`);
      return flowInsertion(text, node, group);
    }
    return blockInsertion(text, node, missingKeys, group);
  }
  throw new ConfigEditRefusedError(`${parent.join('.')} cannot be created`);
}

function parentKey(assignment: Assignment): string {
  return assignment.path.slice(0, -1).join('.');
}

function applyEdits(text: string, edits: readonly TextEdit[]): string {
  return [...edits].sort((left, right) => right.start - left.start).reduce((result, edit) => `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`, text);
}

/**
 * Applies a settings change to the text of a configuration file, changing only the edited
 * values and creating the keys a file left to their defaults, so comments, order and layout stay.
 */
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
