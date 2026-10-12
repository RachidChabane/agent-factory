import { readFile } from 'node:fs/promises';
import type { RolePromptCatalog } from '@agent-factory/application';
import { AGENT_ROLES } from '@agent-factory/domain';
import type { AgentRole } from '@agent-factory/domain';
import { renderRoleTemplate } from './fileRolePromptCatalog.ts';

const UTF8 = 'utf8';
const MISSING_FILE_CODES: readonly string[] = ['ENOENT', 'ENOTDIR'];

export type RolePromptOverrides = Readonly<Partial<Record<AgentRole, string>>>;

export class RolePromptOverrideMissingError extends Error {
  readonly role: AgentRole;
  readonly path: string;

  constructor(role: AgentRole, path: string) {
    super(`The prompt override for role ${role} does not exist: ${path}`);
    this.name = 'RolePromptOverrideMissingError';
    this.role = role;
    this.path = path;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && MISSING_FILE_CODES.includes(error.code);
}

async function readOverride(role: AgentRole, path: string): Promise<readonly [AgentRole, string]> {
  try {
    return [role, await readFile(path, UTF8)];
  } catch (error) {
    if (isMissing(error)) throw new RolePromptOverrideMissingError(role, path);
    throw error;
  }
}

export class LayeredRolePromptCatalog implements RolePromptCatalog {
  private readonly base: RolePromptCatalog;
  private readonly overrides: ReadonlyMap<AgentRole, string>;

  private constructor(base: RolePromptCatalog, overrides: ReadonlyMap<AgentRole, string>) {
    this.base = base;
    this.overrides = overrides;
  }

  static async load(base: RolePromptCatalog, overrides: RolePromptOverrides): Promise<LayeredRolePromptCatalog> {
    const reads = AGENT_ROLES.flatMap((role) => {
      const path = overrides[role];
      return path === undefined ? [] : [readOverride(role, path)];
    });
    return new LayeredRolePromptCatalog(base, new Map(await Promise.all(reads)));
  }

  render(role: AgentRole, values: Record<string, string>): string {
    const template = this.overrides.get(role);
    return template === undefined ? this.base.render(role, values) : renderRoleTemplate(role, template, values);
  }
}
