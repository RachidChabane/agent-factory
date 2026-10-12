import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RolePromptCatalog } from '@agent-factory/application';
import { AGENT_ROLES } from '@agent-factory/domain';
import type { AgentRole } from '@agent-factory/domain';

export const ROLE_TEMPLATE_EXTENSION = '.md';
const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_-]*)\s*\}\}/g;
const UTF8 = 'utf8';
const MISSING_FILE_CODE = 'ENOENT';

export class RolePromptMissingError extends Error {
  constructor(role: AgentRole, directory: string) {
    super(`No prompt template for role ${role} in ${directory}`);
    this.name = 'RolePromptMissingError';
  }
}

export class UnknownPlaceholderError extends Error {
  readonly placeholders: readonly string[];

  constructor(role: AgentRole, placeholders: readonly string[]) {
    super(`The ${role} prompt uses placeholders with no value: ${placeholders.map((name) => `{{${name}}}`).join(', ')}`);
    this.name = 'UnknownPlaceholderError';
    this.placeholders = placeholders;
  }
}

async function readTemplate(directory: string, role: AgentRole): Promise<readonly [AgentRole, string] | null> {
  try {
    return [role, await readFile(join(directory, `${role}${ROLE_TEMPLATE_EXTENSION}`), UTF8)];
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE) return null;
    throw error;
  }
}

export function placeholdersOf(template: string): readonly string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? ''))];
}

export function renderRoleTemplate(role: AgentRole, template: string, values: Record<string, string>): string {
  const unknown = placeholdersOf(template).filter((name) => !Object.hasOwn(values, name));
  if (unknown.length > 0) throw new UnknownPlaceholderError(role, unknown);
  return template.replace(PLACEHOLDER, (_match, name: string) => values[name] ?? '');
}

export class FileRolePromptCatalog implements RolePromptCatalog {
  private readonly directory: string;
  private readonly templates: ReadonlyMap<AgentRole, string>;

  private constructor(directory: string, templates: ReadonlyMap<AgentRole, string>) {
    this.directory = directory;
    this.templates = templates;
  }

  static async load(directory: string): Promise<FileRolePromptCatalog> {
    const entries = await Promise.all(AGENT_ROLES.map((role) => readTemplate(directory, role)));
    return new FileRolePromptCatalog(directory, new Map(entries.filter((entry) => entry !== null)));
  }

  roles(): readonly AgentRole[] {
    return [...this.templates.keys()];
  }

  render(role: AgentRole, values: Record<string, string>): string {
    const template = this.templates.get(role);
    if (template === undefined) throw new RolePromptMissingError(role, this.directory);
    return renderRoleTemplate(role, template, values);
  }
}
