import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { readReviewFindings } from '../../application/src/review/review-findings.ts';
import { parseScenario } from './scenario/scenario-parser.ts';
import { runFakeClaude } from './test-support/fake-claude-process.ts';
import { digList, digNumber, digString } from './test-support/json-navigation.ts';
import { readmeExample } from './test-support/markdown-blocks.ts';
import { createSandbox, type Sandbox } from './test-support/sandbox.ts';
import { assistantTexts, linesOfShape, shapesOf } from './test-support/stream-shape.ts';

const IMPLEMENTER_PROMPT = 'You implement one GitHub issue of acme/widgets in this working tree.\nAdd a sum function.';
const REVIEWER_PROMPT = 'You review one change to acme/widgets against its specification.';
const AUDITOR_PROMPT = 'You audit one change that reached the default branch of acme/widgets.';

describe('the complete example of the README', () => {
  let sandbox: Sandbox;

  before(async () => {
    sandbox = await createSandbox();
    await sandbox.writeScenario(readmeExample());
    await mkdir(join(sandbox.worktree, 'src'), { recursive: true });
    await writeFile(join(sandbox.worktree, 'src', 'scratch.txt'), 'temporary');
  });

  after(async () => {
    await sandbox.dispose();
  });

  it('is a valid scenario', () => {
    const scenario = parseScenario(readmeExample());
    assert.equal(scenario.entries.length, 2);
    assert.equal(scenario.entries[0]?.attempts.length, 2);
  });

  it('plays the first attempt of the matching implementer entry', async () => {
    const run = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(shapesOf(run.lines), ['init', 'rate-limit', 'say', 'tool-use:Write', 'tool-result', 'say', 'result']);
    assert.deepEqual(assistantTexts(run.lines), ['Reading the specification.', 'Added sum.']);
    assert.match(await readFile(join(sandbox.worktree, 'src', 'sum.ts'), 'utf8'), /return a - b;/);
  });

  it('continues with the second attempt when the session is resumed', async () => {
    const first = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT });
    const sessionId = digString(first.lines[0], 'session_id');
    const second = runFakeClaude(sandbox, { prompt: 'The gate is red.', flags: ['--resume', sessionId] });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(linesOfShape(second.lines, 'tool-use:Bash').length, 1);
    assert.match(await readFile(join(sandbox.worktree, 'src', 'sum.ts'), 'utf8'), /return a \+ b;/);
    assert.equal(digString(second.lines.at(-1), 'result'), 'Fixed sum after the gate feedback.');
  });

  it('gives a reviewer the report of the fallback, which the factory reads as one blocking finding', () => {
    const run = runFakeClaude(sandbox, { prompt: REVIEWER_PROMPT });
    const reading = readReviewFindings(digString(run.lines.at(-1), 'result'));
    assert.ok(reading.valid);
    assert.deepEqual(
      reading.findings.map((finding) => [finding.severity, finding.category, finding.file, finding.line]),
      [['blocking', 'correctness', 'src/sum.ts', 2]],
    );
  });

  it('gives an auditor, which has neither entry nor fallback, the built-in verdict', () => {
    const run = runFakeClaude(sandbox, { prompt: AUDITOR_PROMPT });
    assert.match(digString(run.lines.at(-1), 'result'), /"verdict": "keep"/);
  });

  it('reports the limits it declares on /usage', () => {
    const run = runFakeClaude(sandbox, { prompt: '/usage' });
    const limits = digList(run.lines[1], 'usage_report', 'rate_limits', 'limits');
    assert.deepEqual(
      limits.map((limit) => digNumber(limit, 'percent')),
      [41, 63, 12],
    );
  });
});
