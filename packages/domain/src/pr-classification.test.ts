import { describe, expect, it } from 'vitest';
import { classifyChangedFiles, classifyPath, crossCheckDeclaredType } from './pr-classification.ts';

describe('pr classification', () => {
  it.each([
    [['app/components/Foo.vue'], 'ui', 'app-ui'],
    [['app/server/api/x.ts'], 'engine-api', 'app-server'],
    [['app/server/api/x.ts', 'app/components/Foo.vue'], 'ui', 'app-ui'],
    [['agent/src/assistant/skills/plan/SKILL.md'], 'skill-prompt', 'skill-prompt-path'],
    [['agent/src/assistant/tools.py'], 'engine-api', 'agent-code'],
    [['infrastructure/helm/values.yaml'], 'infra-ci', 'infrastructure'],
    [['.github/workflows/ci.yml'], 'infra-ci', 'infrastructure'],
    [['environments/dev.yaml'], 'infra-ci', 'infrastructure'],
    [['scripts/run.sh'], 'infra-ci', 'infrastructure'],
    [['mise.toml'], 'infra-ci', 'infrastructure'],
    [['Dockerfile.agent'], 'infra-ci', 'infrastructure'],
    [['docs/design.md'], 'doc', 'documentation'],
    [['README.md'], 'doc', 'documentation'],
    [['app/package.json', 'pnpm-lock.yaml'], 'dependencies', 'dependency-manifest'],
    [['agent/pyproject.toml'], 'dependencies', 'dependency-manifest'],
    [['app/package.json', 'app/pages/index.vue'], 'ui', 'app-ui'],
    [['docs/a.md', 'infrastructure/x.yaml'], 'infra-ci', 'infrastructure'],
  ] as const)('classifies %j as %s via %s', (paths, type, rule) => {
    expect(classifyChangedFiles(paths)).toEqual({ suggestedType: type, rule });
  });

  it('returns no suggestion for unknown or empty file lists', () => {
    expect(classifyChangedFiles(['random/file.bin'])).toEqual({ suggestedType: null, rule: null });
    expect(classifyChangedFiles([])).toEqual({ suggestedType: null, rule: null });
    expect(classifyPath('other/thing.ts')).toBeNull();
  });

  it('cross-checks the declared type', () => {
    const uiChange = classifyChangedFiles(['app/components/Foo.vue']);
    expect(crossCheckDeclaredType('ui', uiChange).consistent).toBe(true);
    expect(crossCheckDeclaredType('security', uiChange).consistent).toBe(true);
    const mismatch = crossCheckDeclaredType('doc', uiChange);
    expect(mismatch.consistent).toBe(false);
    expect(mismatch.reason).toContain('app-ui');
    expect(crossCheckDeclaredType('doc', classifyChangedFiles([])).consistent).toBe(true);
  });
});
