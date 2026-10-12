import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import { asObject, dig, digList, digNumber, digString, type JsonObject } from './test-support/json-navigation.ts';
import { runFakeClaude, runFakeClaudeWithoutStandardInput, type Completed } from './test-support/fake-claude-process.ts';
import { createSandbox, type Sandbox } from './test-support/sandbox.ts';

const MILLISECONDS_PER_HOUR = 3_600_000;
const TIMING_TOLERANCE_MS = 60_000;
const USAGE_PROBE_FLAGS = ['-p', '/usage', '--output-format', 'stream-json', '--verbose', '--setting-sources', '', '--strict-mcp-config'];
const OFFSET_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+00:00$/;

const EXPECTED_REPORT_WITHOUT_RESET_TIMES = {
  session: {
    total_cost_usd: 0,
    total_api_duration_ms: 0,
    total_duration_ms: 2334,
    total_lines_added: 0,
    total_lines_removed: 0,
    model_usage: {},
  },
  rate_limits: {
    limits: [
      { kind: 'session', group: 'session', percent: 12, scope: null, severity: 'normal', is_active: true },
      { kind: 'weekly_all', group: 'weekly', percent: 34, scope: null, severity: 'normal', is_active: false },
      {
        kind: 'weekly_scoped',
        group: 'weekly',
        percent: 8,
        scope: { model: { display_name: 'Opus' }, surface: null },
        severity: 'normal',
        is_active: false,
      },
    ],
    extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null, currency: null },
  },
};

function limitsOf(report: Completed): readonly JsonObject[] {
  return digList(report.lines[1], 'usage_report', 'rate_limits', 'limits').map((limit) => asObject(limit));
}

function resetOffsetsHours(report: Completed, now: number): readonly number[] {
  return limitsOf(report).map((limit) => (Date.parse(digString(limit, 'resets_at')) - now) / MILLISECONDS_PER_HOUR);
}

function withoutResetTimes(report: Completed): unknown {
  const usageReport = asObject(dig(report.lines[1], 'usage_report'));
  const rateLimits = asObject(usageReport['rate_limits']);
  const limits = limitsOf(report).map((limit) => Object.fromEntries(Object.entries(limit).filter(([key]) => key !== 'resets_at')));
  return { ...usageReport, rate_limits: { ...rateLimits, limits } };
}

describe('the /usage report', () => {
  let sandbox: Sandbox;

  before(async () => {
    sandbox = await createSandbox();
    await sandbox.writeScenario({});
  });

  after(async () => {
    await sandbox.dispose();
  });

  it('prints an init line, an assistant line carrying the report, and a success result, then exits 0', async () => {
    const before = Date.now();
    const report = runFakeClaude(sandbox, { prompt: '/usage\n' });
    assert.equal(report.status, 0, report.stderr);
    assert.deepEqual(
      report.lines.map((line) => [digString(line, 'type'), dig(line, 'subtype')]),
      [
        ['system', 'init'],
        ['assistant', undefined],
        ['result', 'success'],
      ],
    );
    const sessionId = digString(report.lines[0], 'session_id');
    report.lines.forEach((line) => assert.equal(digString(line, 'session_id'), sessionId));

    const content = digList(report.lines[1], 'message', 'content');
    assert.equal(content.length, 1);
    assert.equal(digString(content[0], 'type'), 'text');
    assert.match(digString(content[0], 'text'), /Current session: 12% used/);
    assert.match(digString(content[0], 'text'), /Current week \(Opus\): 8% used/);

    assert.deepEqual(withoutResetTimes(report), EXPECTED_REPORT_WITHOUT_RESET_TIMES);
    const offsets = resetOffsetsHours(report, before);
    [3, 80, 80].forEach((hours, index) => {
      const offset = offsets[index] ?? Number.NaN;
      assert.ok(Math.abs(offset - hours) < TIMING_TOLERANCE_MS / MILLISECONDS_PER_HOUR, `limit ${String(index)} resets in ${String(offset)} h`);
    });
    limitsOf(report).forEach((limit) => assert.match(digString(limit, 'resets_at'), OFFSET_TIMESTAMP));

    const result = report.lines[2];
    assert.equal(dig(result, 'is_error'), false);
    assert.equal(digNumber(result, 'total_cost_usd'), 0);
    assert.equal(digNumber(result, 'num_turns'), 0);
    assert.equal(digString(result, 'result'), digString(content[0], 'text'));
    await assert.rejects(access(sandbox.state), { code: 'ENOENT' }, 'the report must not open a session');
  });

  it('answers the probe of the factory, whose prompt is an argument and whose standard input is closed', () => {
    const report = runFakeClaudeWithoutStandardInput(sandbox, { flags: USAGE_PROBE_FLAGS });
    assert.equal(report.status, 0, report.stderr);
    assert.equal(report.lines.length, 3);
    assert.deepEqual(withoutResetTimes(report), EXPECTED_REPORT_WITHOUT_RESET_TIMES);
  });

  it('takes the limits and their reset times from the usage section of the scenario', async () => {
    await sandbox.writeScenario({
      usage: {
        session: { percent: 95, resetsInHours: 0.5 },
        weeklyAll: { percent: 61.5, resetsInHours: 120 },
        weeklyScoped: [
          { model: 'Sonnet', percent: 20, resetsInHours: 10 },
          { model: 'Haiku', percent: 0 },
        ],
      },
    });
    const before = Date.now();
    const report = runFakeClaude(sandbox, { prompt: '/usage' });
    assert.equal(report.status, 0, report.stderr);
    const limits = limitsOf(report);
    assert.deepEqual(
      limits.map((limit) => [digString(limit, 'kind'), digNumber(limit, 'percent'), dig(limit, 'scope', 'model', 'display_name') ?? null]),
      [
        ['session', 95, null],
        ['weekly_all', 61.5, null],
        ['weekly_scoped', 20, 'Sonnet'],
        ['weekly_scoped', 0, 'Haiku'],
      ],
    );
    const offsets = resetOffsetsHours(report, before);
    [0.5, 120, 10, 80].forEach((hours, index) => {
      assert.ok(Math.abs((offsets[index] ?? Number.NaN) - hours) < TIMING_TOLERANCE_MS / MILLISECONDS_PER_HOUR);
    });
  });

  it('reports no scoped limit when the scenario lists none', async () => {
    await sandbox.writeScenario({ usage: { weeklyScoped: [] } });
    const report = runFakeClaude(sandbox, { prompt: '/usage' });
    assert.deepEqual(
      limitsOf(report).map((limit) => digString(limit, 'kind')),
      ['session', 'weekly_all'],
    );
  });

  it('does not treat a longer prompt that merely starts with /usage as the report request', async () => {
    await sandbox.writeScenario({});
    const run = runFakeClaude(sandbox, { prompt: '/usage and then some' });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.lines.every((line) => dig(line, 'usage_report') === undefined));
    assert.equal(digString(run.lines.at(-1), 'result'), 'Nothing to do.');
  });
});
