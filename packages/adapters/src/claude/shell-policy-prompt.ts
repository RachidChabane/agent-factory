import { CLAUDE_TOOLS } from './role-permissions.ts';

const BASH_RULE_PREFIX = `${CLAUDE_TOOLS.bash}(`;
const BASH_RULE_SUFFIX = ')';
const TRAILING_WILDCARD = /\s*\*$/;
const PARAGRAPH = '\n\n';
const NEWLINE = '\n';

export const NO_SHELL_POLICY = 'This run has no shell. Read and search files with the Read, Grep and Glob tools.';
export const SHELL_POLICY_HEADER = 'Shell commands that run tools or change files are allowed only when they start with one of these prefixes:';
export const SHELL_POLICY_RULES = [
  'Run each such command on its own, from the working directory: a command chained with `cd`, `;`, `&&`, `||` or a pipe into another program can be denied as a whole.',
  'Read and search files with the Read, Grep and Glob tools rather than the shell.',
  'A denied command means only that this one command is not allowed; the listed prefixes keep working.',
].join(NEWLINE);

function isRestrictedBashRule(rule: string): boolean {
  return rule.startsWith(BASH_RULE_PREFIX) && rule.endsWith(BASH_RULE_SUFFIX);
}

export function shellCommandPrefixes(allowedTools: readonly string[]): readonly string[] {
  return allowedTools
    .filter(isRestrictedBashRule)
    .map((rule) => rule.slice(BASH_RULE_PREFIX.length, -BASH_RULE_SUFFIX.length).replace(TRAILING_WILDCARD, ''));
}

export function shellPolicyPrompt(allowedTools: readonly string[]): string | null {
  if (allowedTools.includes(CLAUDE_TOOLS.bash)) return null;
  const prefixes = shellCommandPrefixes(allowedTools);
  if (prefixes.length === 0) return NO_SHELL_POLICY;
  return [SHELL_POLICY_HEADER, prefixes.map((prefix) => `- \`${prefix}\``).join(NEWLINE), SHELL_POLICY_RULES].join(PARAGRAPH);
}

export function appendedSystemPrompt(requested: string, allowedTools: readonly string[]): string {
  return [requested.trim(), shellPolicyPrompt(allowedTools) ?? '']
    .filter((part) => part !== '')
    .join(PARAGRAPH);
}
