import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from './role-permissions.ts';
import { appendedSystemPrompt, NO_SHELL_POLICY, SHELL_POLICY_HEADER, shellCommandPrefixes, shellPolicyPrompt } from './shell-policy-prompt.ts';

describe('shellCommandPrefixes', () => {
  it('lists the command prefixes of the restricted Bash rules', () => {
    expect(shellCommandPrefixes(['Read', 'Bash(uv run *)', 'Bash(git status*)', 'Edit'])).toEqual(['uv run', 'git status']);
  });
});

describe('shellPolicyPrompt', () => {
  it('tells a writing role exactly which shell commands it may run', () => {
    const prompt = shellPolicyPrompt(ROLE_PERMISSIONS['acceptance-author'].allow);

    expect(prompt).toContain(SHELL_POLICY_HEADER);
    for (const prefix of ['npm run', 'npx vitest', 'mise run', 'uv run', 'git status', 'git diff']) {
      expect(prompt).toContain(`- \`${prefix}\``);
    }
    expect(prompt).toContain('A denied command means only that this one command is not allowed');
  });

  it('tells a read-only role it has no shell', () => {
    expect(shellPolicyPrompt(ROLE_PERMISSIONS.reviewer.allow)).toBe(NO_SHELL_POLICY);
  });

  it('adds nothing when the shell is unrestricted', () => {
    expect(shellPolicyPrompt(['Read', 'Bash'])).toBeNull();
  });
});

describe('appendedSystemPrompt', () => {
  it('appends the shell policy to the requested system prompt', () => {
    const prompt = appendedSystemPrompt('Follow the repository rules.\n', ['Bash(uv run *)']);

    expect(prompt.startsWith('Follow the repository rules.\n\n')).toBe(true);
    expect(prompt).toContain('- `uv run`');
  });

  it('is the shell policy alone when nothing else is requested', () => {
    expect(appendedSystemPrompt('', ['Read'])).toBe(NO_SHELL_POLICY);
  });

  it('appends the reference section last and lists the cp prefixes of the snapshots', () => {
    const section = '# Reference repositories\n\nA section.';
    const prompt = appendedSystemPrompt('Be brief.', ['Bash(cp /snap/*)', 'Bash(cp -R /snap/*)'], section);

    expect(prompt.startsWith('Be brief.\n\n')).toBe(true);
    expect(prompt.endsWith(section)).toBe(true);
    expect(prompt).toContain('- `cp /snap/`');
    expect(prompt).toContain('- `cp -R /snap/`');
  });

  it('is the requested prompt alone when the shell is unrestricted', () => {
    expect(appendedSystemPrompt('Be brief.', ['Bash'])).toBe('Be brief.');
  });
});
