import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import { runFakeClaude, type Completed } from './test-support/fake-claude-process.ts';
import { asObject, dig, digList, digString } from './test-support/json-navigation.ts';
import { createSandbox, type Sandbox } from './test-support/sandbox.ts';
import { assistantTexts, linesOfShape } from './test-support/stream-shape.ts';

const JSON_FENCE = /```json\n([\s\S]*?)\n```/;

const OPENINGS = {
  'acceptance-author': 'You write the acceptance checks for one GitHub issue of acme/widgets.',
  implementer: 'You implement one GitHub issue of acme/widgets in this working tree.',
  reviewer: 'You review one change to acme/widgets against its specification.',
  auditor: 'You audit one change that reached the default branch of acme/widgets.',
  challenger: 'You examine a product request for acme/widgets before any work starts.',
} as const;

const SCENARIO = {
  entries: [
    { role: 'implementer', when: 'Issue 7', attempts: [{ final: 'implementer entry 7' }] },
    { role: 'implementer', when: 'Issue 8', attempts: [{ final: 'implementer entry 8' }] },
    { role: 'reviewer', when: 'Issue 7', attempts: [{ final: 'reviewer entry 7' }] },
    { role: 'acceptance-author', when: 'Issue 7', attempts: [{ final: 'author entry 7' }] },
  ],
  fallback: {
    implementer: { attempts: [{ final: 'implementer fallback' }] },
  },
};

function finalTextOf(run: Completed): string {
  return digString(run.lines.at(-1), 'result');
}

function jsonBlockOf(text: string): unknown {
  const block = JSON_FENCE.exec(text)?.[1];
  assert.ok(block !== undefined, `no JSON block in: ${text}`);
  const parsed: unknown = JSON.parse(block);
  return parsed;
}

describe('which behaviour a prompt gets', () => {
  let sandbox: Sandbox;

  before(async () => {
    sandbox = await createSandbox();
    await sandbox.writeScenario(SCENARIO);
  });

  after(async () => {
    await sandbox.dispose();
  });

  function ask(prompt: string): Completed {
    const run = runFakeClaude(sandbox, { prompt });
    assert.equal(run.status, 0, run.stderr);
    return run;
  }

  it('plays the first entry of the role whose trigger occurs in the prompt', () => {
    assert.equal(finalTextOf(ask(`${OPENINGS.implementer}\nIssue 8`)), 'implementer entry 8');
    assert.equal(finalTextOf(ask(`${OPENINGS.implementer}\nIssue 7 and Issue 8`)), 'implementer entry 7');
  });

  it('only considers the entries of the role the prompt belongs to', () => {
    assert.equal(finalTextOf(ask(`${OPENINGS.reviewer}\nIssue 7`)), 'reviewer entry 7');
    assert.equal(finalTextOf(ask(`${OPENINGS['acceptance-author']}\nIssue 7`)), 'author entry 7');
  });

  it('plays the fallback of the role when no entry matches', () => {
    assert.equal(finalTextOf(ask(`${OPENINGS.implementer}\nIssue 99`)), 'implementer fallback');
  });

  it('answers a reviewer without entry or fallback with a report of no finding', () => {
    const text = finalTextOf(ask(`${OPENINGS.reviewer}\nIssue 99`));
    assert.deepEqual(jsonBlockOf(text), { findings: [] });
  });

  it('answers an auditor without entry or fallback with the verdict keep', () => {
    const report = jsonBlockOf(finalTextOf(ask(OPENINGS.auditor)));
    assert.deepEqual(report, { verdict: 'keep', summary: 'The change is sound and needs no action.', findings: [], proposedFix: null });
  });

  it('answers a challenger without entry or fallback with one kept item and no specification', () => {
    const report = jsonBlockOf(finalTextOf(ask(OPENINGS.challenger)));
    assert.deepEqual(Object.keys(asObject(report)), ['summary', 'items', 'specs', 'reply']);
    const items = digList(report, 'items');
    assert.equal(items.length, 1);
    assert.equal(dig(items[0], 'verdict'), 'keep');
    assert.equal(dig(items[0], 'question'), null);
    assert.deepEqual(dig(items[0], 'sources'), []);
    assert.deepEqual(dig(report, 'specs'), []);
  });

  it('answers an acceptance author and an implementer without entry or fallback with a short text and no file change', async () => {
    for (const prompt of [OPENINGS['acceptance-author'], OPENINGS.implementer]) {
      const run = ask(prompt);
      const [text, ...others] = assistantTexts(run.lines);
      assert.ok(text !== undefined && text.length > 0);
      assert.deepEqual(others, []);
      assert.equal(linesOfShape(run.lines, 'tool-use:Write').length + linesOfShape(run.lines, 'tool-use:Bash').length, 0);
    }
    assert.deepEqual(await readdir(sandbox.worktree), []);
  });

  it('says there is nothing to do when the prompt belongs to no role', () => {
    assert.equal(finalTextOf(ask('Please summarise the release notes.')), 'Nothing to do.');
  });

  it('recognises the role by its first signature when a diff quotes another one later', () => {
    const prompt = `${OPENINGS.reviewer}\nIssue 7\n<diff>\n+ // You implement one change at a time\n</diff>`;
    assert.equal(finalTextOf(ask(prompt)), 'reviewer entry 7');
  });

  it('uses the signatures a scenario overrides', async () => {
    await sandbox.writeScenario({ signatures: { implementer: 'Build the feature' }, entries: [{ role: 'implementer', when: 'x', attempts: [{ final: 'custom signature' }] }] });
    assert.equal(finalTextOf(ask('Build the feature x')), 'custom signature');
    assert.equal(finalTextOf(ask(`${OPENINGS.implementer} x`)), 'Nothing to do.');
    await sandbox.writeScenario(SCENARIO);
  });
});
