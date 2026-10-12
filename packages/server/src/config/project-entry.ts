import { isMap, isSeq, parseDocument, stringify } from 'yaml';
import { CONFIG_SCHEMA_ID } from './config-json-schema.ts';
import { ConfigEditRefusedError, CONFIG_KEYS } from './config-document.ts';
import { CONFIG_VERSION } from './schema/common.ts';

const NEWLINE = '\n';
const ITEM_MARKER = '- ';
const ITEM_CONTINUATION = '  ';
const DEFAULT_ITEM_INDENT = '  ';
const SCHEMA_COMMENT = `# yaml-language-server: $schema=${CONFIG_SCHEMA_ID}`;

export class ProjectAlreadyDeclaredError extends Error {
  constructor(id: string) {
    super(`The configuration already declares a project ${id}; pass --force to replace it, or --id to add the repository under another id`);
    this.name = 'ProjectAlreadyDeclaredError';
  }
}

/** A project as one item of the `projects` sequence, at the given indentation. */
export function projectItemText(project: Readonly<Record<string, unknown>>, indent: string): string {
  const lines = stringify(project, { lineWidth: 0 }).trimEnd().split(NEWLINE);
  return `${lines.map((line, index) => `${indent}${index === 0 ? ITEM_MARKER : ITEM_CONTINUATION}${line}`).join(NEWLINE)}${NEWLINE}`;
}

/** A new configuration that declares one project and leaves every installation setting to its default. */
export function newConfigText(project: Readonly<Record<string, unknown>>): string {
  return [SCHEMA_COMMENT, `version: ${CONFIG_VERSION}`, '', `${CONFIG_KEYS.projects}:`, projectItemText(project, DEFAULT_ITEM_INDENT)].join(NEWLINE);
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf(NEWLINE, offset - 1) + 1;
}

function lineEnd(text: string, offset: number): number {
  const end = text.indexOf(NEWLINE, offset);
  return end === -1 ? text.length : end + NEWLINE.length;
}

/** The end of the line an item's last value ends on; the lines after it, comments included, belong to what follows. */
function itemEnd(text: string, range: readonly [number, number, number]): number {
  return lineEnd(text, Math.max(range[1] - 1, range[0]));
}

/**
 * Adds a project to the text of a configuration, after the projects it declares and in their
 * layout, or replaces the project of the same id when `replace` is set. Comments and the rest of
 * the file stay as they are.
 */
export function withProjectEntry(text: string, project: Readonly<Record<string, unknown>> & { readonly id: string }, replace: boolean): string {
  const document = parseDocument(text);
  if (document.errors.length > 0) throw new ConfigEditRefusedError(`it does not parse (${document.errors.map((error) => error.message.split(NEWLINE)[0] ?? '').join('; ')})`);
  const projects = document.get(CONFIG_KEYS.projects, true);
  if (projects === undefined || projects === null) {
    const separator = text.endsWith(NEWLINE) || text === '' ? '' : NEWLINE;
    return `${text}${separator}${NEWLINE}${CONFIG_KEYS.projects}:${NEWLINE}${projectItemText(project, DEFAULT_ITEM_INDENT)}`;
  }
  if (!isSeq(projects) || projects.flow === true || projects.range === null || projects.range === undefined) {
    throw new ConfigEditRefusedError(`${CONFIG_KEYS.projects} is not a list of projects written one per block; add the project by hand`);
  }
  const items = projects.items.filter(isMap);
  const first = items[0];
  const firstStart = first?.range?.[0];
  const prefix = firstStart === undefined ? DEFAULT_ITEM_INDENT + ITEM_MARKER : text.slice(lineStart(text, firstStart), firstStart);
  const indent = prefix.slice(0, Math.max(prefix.indexOf(ITEM_MARKER.trim()), 0));
  const entry = projectItemText(project, indent);
  const index = items.findIndex((item) => item.get(CONFIG_KEYS.id) === project.id);
  if (index !== -1) {
    if (!replace) throw new ProjectAlreadyDeclaredError(project.id);
    const range = items[index]?.range;
    if (range === undefined || range === null) throw new ConfigEditRefusedError(`project ${project.id} has no source position`);
    return `${text.slice(0, lineStart(text, range[0]))}${entry}${text.slice(itemEnd(text, range))}`;
  }
  const lastRange = items.at(-1)?.range;
  const at = lastRange === undefined || lastRange === null ? lineEnd(text, projects.range[0]) : itemEnd(text, lastRange);
  const separator = at > 0 && text[at - 1] !== NEWLINE ? NEWLINE : '';
  return `${text.slice(0, at)}${separator}${entry}${text.slice(at)}`;
}
