import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { runFakeClaudeWithoutStandardInput } from './test-support/fake-claude-process.ts';
import { createSandbox, type Sandbox } from './test-support/sandbox.ts';

const AUTH_STATUS_FLAGS = ['auth', 'status'];

describe('auth status', () => {
  let sandbox: Sandbox;

  before(async () => {
    sandbox = await createSandbox();
  });

  after(async () => {
    await sandbox.dispose();
  });

  it('reports the login of the scenario as one JSON object, without opening a session', async () => {
    await sandbox.writeScenario({ account: { email: 'alex.morgan@example.com', organization: 'Example Org', subscriptionType: 'team' } });
    const status = runFakeClaudeWithoutStandardInput(sandbox, { flags: AUTH_STATUS_FLAGS });
    assert.equal(status.status, 0, status.stderr);
    assert.deepEqual(JSON.parse(status.stdout), {
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      email: 'alex.morgan@example.com',
      orgName: 'Example Org',
      subscriptionType: 'team',
    });
  });

  it('reports a default login when the scenario names none', async () => {
    await sandbox.writeScenario({});
    const status = runFakeClaudeWithoutStandardInput(sandbox, { flags: AUTH_STATUS_FLAGS });
    assert.equal(status.status, 0, status.stderr);
    assert.equal((JSON.parse(status.stdout) as { readonly email: string }).email, 'operator@example.com');
  });

  it('refuses an account section with an unknown field', async () => {
    await sandbox.writeScenario({ account: { email: 'alex.morgan@example.com', plan: 'team' } });
    const status = runFakeClaudeWithoutStandardInput(sandbox, { flags: AUTH_STATUS_FLAGS });
    assert.equal(status.status, 2);
    assert.match(status.stderr, /account/);
  });
});
