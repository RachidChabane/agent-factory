import type { AgentRole } from '@agent-factory/domain';

export const CLAUDE_TOOLS = {
  read: 'Read',
  edit: 'Edit',
  write: 'Write',
  glob: 'Glob',
  grep: 'Grep',
  bash: 'Bash',
  webFetch: 'WebFetch',
} as const;

const MCP_TOOL_PREFIX = 'mcp__';
const RULE_SPECIFIER_START = '(';

export function bashRule(pattern: string): string {
  return `${CLAUDE_TOOLS.bash}(${pattern})`;
}

const READ_ONLY_TOOLS = [CLAUDE_TOOLS.read, CLAUDE_TOOLS.glob, CLAUDE_TOOLS.grep] as const;

const WORKTREE_BASH_COMMANDS = [
  'npm run *',
  'npx vitest *',
  'mise run *',
  'uv run *',
  'git status*',
  'git diff*',
] as const;

const WRITING_ROLE_ALLOW = [
  ...READ_ONLY_TOOLS,
  CLAUDE_TOOLS.edit,
  CLAUDE_TOOLS.write,
  ...WORKTREE_BASH_COMMANDS.map(bashRule),
] as const;

export const OUTWARD_ACTION_DENY = [
  bashRule('git push*'),
  bashRule('gh *'),
  bashRule('curl *'),
  bashRule('rm -rf*'),
  bashRule('security *'),
  CLAUDE_TOOLS.webFetch,
] as const;

export interface RolePermissions {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
  /** Whether the role runs the shell commands the project declares for its agents. */
  readonly runsProjectCommands: boolean;
  /** Whether the role copies files out of the reference snapshots of its project into its worktree. */
  readonly copiesReferences: boolean;
}

const READ_ONLY_ROLE: RolePermissions = { allow: READ_ONLY_TOOLS, deny: OUTWARD_ACTION_DENY, runsProjectCommands: false, copiesReferences: false };
const WRITING_ROLE: RolePermissions = { allow: WRITING_ROLE_ALLOW, deny: OUTWARD_ACTION_DENY, runsProjectCommands: true, copiesReferences: true };

export const ROLE_PERMISSIONS: Readonly<Record<AgentRole, RolePermissions>> = {
  challenger: READ_ONLY_ROLE,
  'acceptance-author': WRITING_ROLE,
  implementer: WRITING_ROLE,
  reviewer: READ_ONLY_ROLE,
  auditor: READ_ONLY_ROLE,
  'release-auditor': READ_ONLY_ROLE,
  summarizer: READ_ONLY_ROLE,
};

export function toolOfRule(rule: string): string {
  const specifierStart = rule.indexOf(RULE_SPECIFIER_START);
  return specifierStart === -1 ? rule : rule.slice(0, specifierStart);
}

export function builtInToolsOf(rules: readonly string[]): readonly string[] {
  return [...new Set(rules.map(toolOfRule).filter((tool) => !tool.startsWith(MCP_TOOL_PREFIX)))];
}
