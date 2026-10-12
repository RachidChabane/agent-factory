export interface DryForm {
  readonly command: string;
  readonly purpose: string;
}

interface DryFormRule {
  readonly pattern: RegExp;
  build(match: RegExpExecArray): DryForm;
}

const MISE_RUN = /^\s*mise\s+run\s+([A-Za-z0-9:_./-]+)/;
const NPM_RUN = /^\s*npm\s+run\s+([A-Za-z0-9:_./-]+)(?:.*?\s--workspace(?:=|\s+)([A-Za-z0-9@:_./-]+))?/;
const UV_RUN = /^\s*uv\s+run\b/;

const DRY_FORM_RULES: readonly DryFormRule[] = [
  { pattern: MISE_RUN, build: (match) => ({ command: `mise tasks info ${match[1] ?? ''}`, purpose: 'mise resolves the task and its tools' }) },
  {
    pattern: NPM_RUN,
    build: (match) => ({
      command: match[2] === undefined ? 'npm run' : `npm run --workspace ${match[2]}`,
      purpose: 'npm lists the scripts of the workspace',
    }),
  },
  { pattern: UV_RUN, build: () => ({ command: 'uv run --offline --no-sync python --version', purpose: 'uv finds its interpreter offline' }) },
];

export function dryFormOf(command: string): DryForm | null {
  for (const rule of DRY_FORM_RULES) {
    const match = rule.pattern.exec(command);
    if (match !== null) return rule.build(match);
  }
  return null;
}
