import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DocumentError } from './json/json-reader.ts';
import { loadHookConfiguration } from './hooks/hook-settings-file.ts';
import {
  DEFAULT_HOOK_TIMEOUT_SECONDS,
  NO_HOOKS,
  allHooks,
  hooksMatching,
  parseHookConfiguration,
} from './hooks/hook-settings.ts';

function settingsWith(hooks: object): object {
  return { permissions: { allow: ['Read'], deny: [] }, sandbox: { enabled: true }, hooks };
}

function commandHook(command: string, extra: object = {}): object {
  return { type: 'command', command, ...extra };
}

function messageOf(document: unknown): string {
  try {
    parseHookConfiguration(document);
  } catch (error) {
    assert.ok(error instanceof DocumentError, `expected a DocumentError, got ${String(error)}`);
    return error.message;
  }
  return assert.fail('the settings were accepted');
}

describe('parseHookConfiguration', () => {
  it('finds no hooks in settings that declare none', () => {
    assert.equal(parseHookConfiguration({}), NO_HOOKS);
    assert.deepEqual(parseHookConfiguration(settingsWith({})), NO_HOOKS);
    assert.deepEqual(parseHookConfiguration(settingsWith({ SessionStart: [{ hooks: [commandHook('ignored')] }] })), NO_HOOKS);
  });

  it('reads the PreToolUse and Stop hooks the way the factory renders them', () => {
    const configuration = parseHookConfiguration(
      settingsWith({
        PreToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [commandHook("'/usr/bin/node' '/hooks/guard.ts' --policy '/p.json'", { timeout: 30 })] }],
        Stop: [{ hooks: [commandHook("'/usr/bin/node' '/hooks/gate.ts' --policy '/p.json'", { timeout: 930 })] }],
      }),
    );
    assert.deepEqual(
      configuration.preToolUse.map((group) => group.hooks),
      [[{ command: "'/usr/bin/node' '/hooks/guard.ts' --policy '/p.json'", timeoutSeconds: 30 }]],
    );
    assert.deepEqual(allHooks(configuration.stop), [{ command: "'/usr/bin/node' '/hooks/gate.ts' --policy '/p.json'", timeoutSeconds: 930 }]);
    assert.equal(configuration.stop[0]?.matcher, null);
  });

  it('gives a hook without a timeout the default one of the CLI', () => {
    const configuration = parseHookConfiguration(settingsWith({ Stop: [{ hooks: [commandHook('check')] }] }));
    assert.equal(allHooks(configuration.stop)[0]?.timeoutSeconds, DEFAULT_HOOK_TIMEOUT_SECONDS);
  });

  it('skips the hooks that are not shell commands', () => {
    const configuration = parseHookConfiguration(
      settingsWith({ Stop: [{ hooks: [{ type: 'prompt', prompt: 'are you done?' }, commandHook('check')] }] }),
    );
    assert.deepEqual(allHooks(configuration.stop).map((hook) => hook.command), ['check']);
  });
});

describe('hooksMatching', () => {
  const groups = parseHookConfiguration(
    settingsWith({
      PreToolUse: [
        { matcher: 'Edit|Write', hooks: [commandHook('edit-or-write')] },
        { matcher: 'Write', hooks: [commandHook('write-only')] },
        { matcher: 'Wri', hooks: [commandHook('prefix-only')] },
        { matcher: 'Wri.*', hooks: [commandHook('pattern')] },
        { matcher: 'Bash', hooks: [commandHook('bash-only')] },
        { matcher: '*', hooks: [commandHook('star')] },
        { matcher: '', hooks: [commandHook('empty')] },
        { hooks: [commandHook('unconditional')] },
      ],
    }),
  ).preToolUse;

  it('matches the whole tool name against the regular expression', () => {
    assert.deepEqual(
      hooksMatching(groups, 'Write').map((hook) => hook.command),
      ['edit-or-write', 'write-only', 'pattern', 'star', 'empty', 'unconditional'],
    );
  });

  it('runs hooks without a matcher, or with an empty one or a star, for every tool', () => {
    assert.deepEqual(
      hooksMatching(groups, 'Bash').map((hook) => hook.command),
      ['bash-only', 'star', 'empty', 'unconditional'],
    );
  });
});

describe('parseHookConfiguration errors name the bad field', () => {
  it('rejects hooks that are not an object', () => {
    assert.equal(messageOf({ hooks: [] }), 'hooks must be an object');
  });

  it('rejects an event whose groups are not a list', () => {
    assert.equal(messageOf(settingsWith({ Stop: {} })), 'hooks.Stop must be an array');
  });

  it('rejects a group without a hook list', () => {
    assert.equal(messageOf(settingsWith({ Stop: [{}] })), 'hooks.Stop[0].hooks must be an array');
  });

  it('rejects a hook without a type or without a command', () => {
    assert.equal(messageOf(settingsWith({ Stop: [{ hooks: [{ command: 'x' }] }] })), 'hooks.Stop[0].hooks[0].type must be a string');
    assert.equal(messageOf(settingsWith({ Stop: [{ hooks: [{ type: 'command' }] }] })), 'hooks.Stop[0].hooks[0].command must be a non-empty string');
  });

  it('rejects a matcher that is not a regular expression', () => {
    assert.ok(messageOf(settingsWith({ PreToolUse: [{ matcher: '(', hooks: [] }] })).startsWith('hooks.PreToolUse[0].matcher is not a valid regular expression'));
  });

  it('rejects a timeout that is not a positive number of seconds', () => {
    assert.ok(messageOf(settingsWith({ Stop: [{ hooks: [commandHook('x', { timeout: 0 })] }] })).startsWith('hooks.Stop[0].hooks[0].timeout must be a number between'));
  });
});

describe('loadHookConfiguration', () => {
  it('finds no hooks without a settings argument', async () => {
    assert.equal(await loadHookConfiguration(null, process.cwd()), NO_HOOKS);
  });

  it('reads inline JSON like the real CLI does', async () => {
    const configuration = await loadHookConfiguration(JSON.stringify(settingsWith({ Stop: [{ hooks: [commandHook('inline')] }] })), process.cwd());
    assert.deepEqual(allHooks(configuration.stop).map((hook) => hook.command), ['inline']);
  });
});
