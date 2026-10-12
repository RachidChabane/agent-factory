import type { IssueType } from './model.ts';

export const CLASSIFICATION_RULES = [
  'dependency-manifest',
  'skill-prompt-path',
  'documentation',
  'agent-code',
  'app-server',
  'app-ui',
  'infrastructure',
] as const;
export type ClassificationRule = (typeof CLASSIFICATION_RULES)[number];

const PATH_DERIVABLE_TYPE_BY_RULE: Readonly<Record<ClassificationRule, IssueType>> = {
  'dependency-manifest': 'dependencies',
  'skill-prompt-path': 'skill-prompt',
  documentation: 'doc',
  'agent-code': 'engine-api',
  'app-server': 'engine-api',
  'app-ui': 'ui',
  infrastructure: 'infra-ci',
};

const AGGREGATION_PRIORITY: readonly ClassificationRule[] = [
  'skill-prompt-path',
  'app-ui',
  'agent-code',
  'app-server',
  'infrastructure',
  'dependency-manifest',
  'documentation',
];

export const NON_PATH_DERIVABLE_TYPES: readonly IssueType[] = ['security', 'data', 'refactor', 'release'];

const DEPENDENCY_FILE_NAMES: readonly string[] = [
  'package.json',
  'pyproject.toml',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'uv.lock',
  'poetry.lock',
  'Pipfile.lock',
];
const INFRA_PREFIXES: readonly string[] = ['infrastructure/', '.github/', 'environments/', 'scripts/'];
const INFRA_FILE_NAMES: readonly string[] = ['mise.toml'];
const DOCUMENTATION_PREFIX = 'docs/';
const MARKDOWN_SUFFIX = '.md';
const DOCKERFILE_PREFIX = 'Dockerfile';
const APP_PREFIX = 'app/';
const APP_SERVER_PREFIX = 'app/server/';
const AGENT_PREFIX = 'agent/';
const SKILL_PATH_PATTERN = /^agent\/src\/(?:.*\/)?skills\//;

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function classifyPath(path: string): ClassificationRule | null {
  const name = baseName(path);
  if (DEPENDENCY_FILE_NAMES.includes(name)) return 'dependency-manifest';
  if (SKILL_PATH_PATTERN.test(path)) return 'skill-prompt-path';
  if (path.startsWith(DOCUMENTATION_PREFIX) || name.endsWith(MARKDOWN_SUFFIX)) return 'documentation';
  if (path.startsWith(AGENT_PREFIX)) return 'agent-code';
  if (path.startsWith(APP_SERVER_PREFIX)) return 'app-server';
  if (path.startsWith(APP_PREFIX)) return 'app-ui';
  if (
    INFRA_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    INFRA_FILE_NAMES.includes(name) ||
    name.startsWith(DOCKERFILE_PREFIX)
  ) {
    return 'infrastructure';
  }
  return null;
}

export interface PrClassification {
  readonly suggestedType: IssueType | null;
  readonly rule: ClassificationRule | null;
}

export function classifyChangedFiles(paths: readonly string[]): PrClassification {
  const fired = new Set(paths.map(classifyPath));
  const rule = AGGREGATION_PRIORITY.find((candidate) => fired.has(candidate)) ?? null;
  return { suggestedType: rule === null ? null : PATH_DERIVABLE_TYPE_BY_RULE[rule], rule };
}

export interface DeclaredTypeCheck {
  readonly consistent: boolean;
  readonly reason: string | null;
}

export function crossCheckDeclaredType(declared: IssueType, classification: PrClassification): DeclaredTypeCheck {
  const { suggestedType, rule } = classification;
  if (suggestedType === null || suggestedType === declared || NON_PATH_DERIVABLE_TYPES.includes(declared)) {
    return { consistent: true, reason: null };
  }
  return {
    consistent: false,
    reason: `declared type ${declared} but changed files suggest ${suggestedType} (rule ${rule})`,
  };
}
