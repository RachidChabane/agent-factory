import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { factoryFlags, runFakeClaude, type Completed } from './test-support/fake-claude-process.ts';
import { dig } from './test-support/json-navigation.ts';
import { createSandbox, type Sandbox } from './test-support/sandbox.ts';
import { assistantTexts } from './test-support/stream-shape.ts';

const IMPLEMENTER_PROMPT = 'You implement one GitHub issue of acme/widgets in this working tree.';
const EXIT_CODE_INVALID_INVOCATION = 2;

describe('an invocation the fake cannot serve', () => {
  let sandbox: Sandbox;

  before(async () => {
    sandbox = await createSandbox();
  });

  after(async () => {
    await sandbox.dispose();
  });

  function expectRefusal(run: Completed, message: RegExp): void {
    assert.equal(run.status, EXIT_CODE_INVALID_INVOCATION, `stderr: ${run.stderr}`);
    assert.equal(run.stdout, '', 'nothing may be printed on standard output');
    assert.match(run.stderr, message);
    assert.ok(run.stderr.startsWith('fake-claude: '), run.stderr);
    assert.equal(run.stderr.trimEnd().split('\n').length, 1, 'one line of explanation');
  }

  it('refuses to run without --scenario', () => {
    expectRefusal(runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, ownFlags: ['--state', sandbox.state] }), /--scenario <file> is required/);
  });

  it('refuses to run when the scenario file does not exist', () => {
    const missing = sandbox.path('absent.json');
    expectRefusal(runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, ownFlags: ['--scenario', missing, '--state', sandbox.state] }), new RegExp(`scenario ${missing} does not exist`));
  });

  it('refuses a scenario that is not JSON', async () => {
    await sandbox.writeText('broken.json', '{ "entries": [');
    const run = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, ownFlags: ['--scenario', sandbox.path('broken.json'), '--state', sandbox.state] });
    expectRefusal(run, /invalid scenario .*broken\.json: not valid JSON/);
  });

  it('names the file and the field of a scenario that is not valid', async () => {
    await sandbox.writeScenario({ entries: [{ role: 'implementer', when: 'x', attempts: [{ steps: [{ write: { path: '/etc/passwd', content: '' } }] }] }] });
    const run = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT });
    expectRefusal(run, new RegExp(`invalid scenario ${sandbox.scenarioFile}: entries\\[0\\]\\.attempts\\[0\\]\\.steps\\[0\\]\\.write\\.path must be relative to the working directory`));
  });

  it('validates the scenario before it answers /usage', async () => {
    await sandbox.writeScenario({ usage: { session: { percent: 400 } } });
    expectRefusal(runFakeClaude(sandbox, { prompt: '/usage' }), /usage\.session\.percent must be a number between 0 and 100/);
  });

  it('refuses to run an agent without --state, but does not need one for /usage', async () => {
    await sandbox.writeScenario({});
    expectRefusal(runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, ownFlags: ['--scenario', sandbox.scenarioFile] }), /--state <directory> is required/);
    const usage = runFakeClaude(sandbox, { prompt: '/usage', ownFlags: ['--scenario', sandbox.scenarioFile] });
    assert.equal(usage.status, 0, usage.stderr);
  });

  it('resolves a relative scenario path and a relative state directory against the current directory', async () => {
    await sandbox.writeScenario({ entries: [{ role: 'implementer', when: 'acme', attempts: [{ final: 'relative paths work' }] }] });
    const run = runFakeClaude(sandbox, {
      prompt: IMPLEMENTER_PROMPT,
      ownFlags: ['--scenario', relative(sandbox.worktree, sandbox.scenarioFile), '--state', '../relative-state'],
    });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(assistantTexts(run.lines), ['relative paths work']);
    await access(sandbox.path('relative-state', 'sessions'));
  });

  it('refuses settings that are not valid, naming the field', async () => {
    await sandbox.writeScenario({});
    const settings = await sandbox.writeText('bad-settings.json', JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command' }] }] } }));
    expectRefusal(
      runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, flags: factoryFlags(settings) }),
      new RegExp(`invalid settings ${settings}: hooks\\.Stop\\[0\\]\\.hooks\\[0\\]\\.command must be a non-empty string`),
    );
  });

  it('refuses a settings file that does not exist', async () => {
    const missing = sandbox.path('no-settings.json');
    expectRefusal(runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, flags: factoryFlags(missing) }), new RegExp(`settings ${missing} does not exist`));
  });

  it('accepts settings given inline as JSON, like the real CLI', async () => {
    await sandbox.writeScenario({});
    const inline = JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'exit 0' }] }] } });
    const run = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, flags: factoryFlags(inline) });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.lines.some((line) => dig(line, 'subtype') === 'hook_response'));
  });

  it('refuses a session record it cannot read', async () => {
    await sandbox.writeScenario({});
    const sessionId = '11111111-1111-4111-8111-111111111111';
    await mkdir(join(sandbox.state, 'sessions'), { recursive: true });
    await writeFile(join(sandbox.state, 'sessions', `${sessionId}.json`), '{"sessionId": 3}');
    const run = runFakeClaude(sandbox, { prompt: 'go on', flags: [...factoryFlags(null), '--resume', sessionId] });
    expectRefusal(run, /invalid session record .*: sessionId must be a non-empty string/);
  });

  it('ignores flags it does not know, with or without a value', () => {
    const run = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, flags: [...factoryFlags(null), '--brand-new-switch', '--brand-new-option', 'value', '--other=1'] });
    assert.equal(run.status, 0, run.stderr);
  });
});
