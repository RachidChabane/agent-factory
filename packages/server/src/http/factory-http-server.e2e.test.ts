import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CockpitSnapshotSchema,
  CommandAcceptedSchema,
  COMMAND_TOKEN_HEADER,
  COMMAND_TOKEN_META_NAME,
  CommandRejectedSchema,
  FactoryEventRecordSchema,
  RunFinishedPayloadSchema,
  RunLogLineSchema,
  RunLogPageSchema,
  RunStartedPayloadSchema,
  TelemetrySampleSchema,
} from '@agent-factory/cockpit';
import { openFactory, type FactoryContainer } from '../composition/factory-container.ts';
import { createHttpServer, startFactoryRuntime, type FactoryRuntime } from '../composition/factory-runtime.ts';
import { SILENT_LOG } from '../composition/operation-log.ts';
import { DECISION_QUESTION, RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';

const TIMEOUT_MS = 60_000;
const FAST_STREAM = { heartbeatMs: 200, pollMs: 100, telemetryMs: 150 };
const SETTLE_MS = 500;
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };
const COCKPIT_PAGE = '<!doctype html><html><head><title>Cockpit</title></head><body></body></html>';
const TOKEN_META = new RegExp(`<meta name="${COMMAND_TOKEN_META_NAME}" content="([0-9a-f]+)">`);
const FRAME_SEPARATOR = '\n\n';

interface Frame {
  readonly event: string;
  readonly data: string;
}

class FrameReader {
  readonly frames: Frame[] = [];
  private buffer = '';
  private readonly controller = new AbortController();

  async open(url: string): Promise<void> {
    const response = await fetch(url, { signal: this.controller.signal, headers: { accept: 'text/event-stream' } });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = response.body;
    if (body === null) throw new Error('the event stream has no body');
    void this.pump(body.getReader());
  }

  close(): void {
    this.controller.abort();
  }

  find(event: string, matches: (data: unknown) => boolean): unknown {
    for (const frame of this.frames) {
      if (frame.event !== event) continue;
      const data: unknown = JSON.parse(frame.data);
      if (matches(data)) return data;
    }
    return null;
  }

  private async pump(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        this.buffer += decoder.decode(value, { stream: true });
        let end = this.buffer.indexOf(FRAME_SEPARATOR);
        while (end !== -1) {
          this.parse(this.buffer.slice(0, end));
          this.buffer = this.buffer.slice(end + FRAME_SEPARATOR.length);
          end = this.buffer.indexOf(FRAME_SEPARATOR);
        }
      }
    } catch {
      return;
    }
  }

  private parse(block: string): void {
    const lines = block.split('\n');
    const event = lines.find((line) => line.startsWith('event: '))?.slice('event: '.length);
    const data = lines.find((line) => line.startsWith('data: '))?.slice('data: '.length);
    if (event !== undefined && data !== undefined) this.frames.push({ event, data });
  }
}

function typed(data: unknown, type: string): boolean {
  return typeof data === 'object' && data !== null && 'type' in data && data.type === type;
}

describe('factory HTTP server end to end', () => {
  let rehearsal: RehearsalEnvironment;
  let factory: FactoryContainer;
  let runtime: FactoryRuntime;
  let controller: AbortController;
  let base: string;
  let commandHeaders: Record<string, string>;
  let agents: RehearsalAgents;

  beforeEach(async () => {
    rehearsal = await createRehearsal();
    agents = new RehearsalAgents();
    factory = await openFactory(rehearsal.config, rehearsal.environment, {
      harness: agents,
      resources: NORMAL_RESOURCES,
      fetch: () => Promise.resolve({ status: 200 }),
      log: SILENT_LOG,
    });
    const cockpitDirectory = join(rehearsal.root, 'cockpit-dist');
    await mkdir(join(cockpitDirectory, 'assets'), { recursive: true });
    await writeFile(join(cockpitDirectory, 'index.html'), COCKPIT_PAGE);
    await writeFile(join(cockpitDirectory, 'assets', 'app.js'), 'console.log(1);');
    controller = new AbortController();
    runtime = await startFactoryRuntime(factory, controller.signal, { stream: FAST_STREAM, cockpitDirectory });
    base = `http://127.0.0.1:${runtime.address.port}`;
    commandHeaders = { [COMMAND_TOKEN_HEADER]: TOKEN_META.exec(await (await fetch(`${base}/`)).text())?.[1] ?? '' };
  });

  afterEach(async () => {
    controller.abort();
    await runtime.finished;
    factory.close();
    await rehearsal.cleanup();
  });

  it(
    'serves a snapshot the cockpit accepts and streams the factory live',
    async () => {
      const initial = CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
      const stream = new FrameReader();
      await stream.open(`${base}/api/events?after=${initial.sequence}`);

      const issue = await rehearsal.addDocIssue('Document the cockpit');
      const opened = await waitFor(
        async () => stream.find('factory', (data) => typed(data, 'issue.transitioned') && JSON.stringify(data).includes('"to":"pr-open"')),
        TIMEOUT_MS,
        'the pull request to open',
      );
      expect(FactoryEventRecordSchema.parse(opened).subject).toBe(`issue/${issue}`);
      const started = FactoryEventRecordSchema.parse(stream.find('factory', (data) => typed(data, 'run.started')));
      const run = RunStartedPayloadSchema.parse(started.payload);
      expect(run).toMatchObject({ role: 'acceptance-author', subject: { kind: 'issue', id: String(issue) }, status: 'running' });
      expect(RunFinishedPayloadSchema.parse(FactoryEventRecordSchema.parse(stream.find('factory', (data) => typed(data, 'run.finished'))).payload).status).toBe(
        'succeeded',
      );
      expect(RunLogLineSchema.parse(stream.find('run-log', () => true))).toMatchObject({ index: 0 });
      await waitFor(async () => stream.find('telemetry', () => true), TIMEOUT_MS, 'a telemetry sample');
      expect(TelemetrySampleSchema.parse(stream.find('telemetry', () => true)).resources.pressure).toBe('normal');

      const page = RunLogPageSchema.parse(await (await fetch(`${base}/api/runs/${run.id}/log?after=0`)).json());
      expect(page.lines.map((line) => line.index)).toEqual(page.lines.map((_line, position) => position + 1));

      const snapshot = CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
      expect(snapshot.issues.find((entry) => entry.number === issue)?.state).toBe('pr-open');
      expect(snapshot.pullRequests).toHaveLength(1);
      expect(snapshot.runs.length).toBeGreaterThanOrEqual(3);

      const paused = await fetch(`${base}/api/commands/scheduler.pause`, { method: 'POST', body: '{}', headers: { ...commandHeaders, 'content-type': 'application/json' } });
      const accepted = CommandAcceptedSchema.parse(await paused.json());
      await waitFor(async () => stream.find('factory', (data) => typed(data, 'scheduler.paused')), TIMEOUT_MS, 'the pause event');
      expect(CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json())).toMatchObject({
        sequence: accepted.sequence,
        factory: { schedulerPaused: true },
      });
      stream.close();
    },
    TIMEOUT_MS * 2,
  );

  it(
    'shows an implementer question as waiting on the operator and resumes the issue with the answer',
    async () => {
      agents.decisionsToAsk = 1;
      const issue = await rehearsal.addDocIssue('Document the release owners');
      const waiting = await waitFor(async () => {
        const snapshot = CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
        return snapshot.runs.find((run) => run.pendingQuestion !== null) ?? null;
      }, TIMEOUT_MS, 'the waiting run');
      expect(waiting).toMatchObject({ role: 'implementer', status: 'waiting', outcome: 'decision-requested' });
      expect(waiting.pendingQuestion?.text).toBe(DECISION_QUESTION);
      const snapshot = CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
      expect(snapshot.issues.find((entry) => entry.number === issue)).toMatchObject({ state: 'needs-human', resumeTarget: 'implementing' });

      const answered = await fetch(`${base}/api/commands/run.answer`, {
        method: 'POST',
        headers: commandHeaders,
        body: JSON.stringify({ runId: waiting.id, questionId: waiting.pendingQuestion?.id ?? '', answer: 'By team.' }),
      });
      expect(answered.status).toBe(200);
      CommandAcceptedSchema.parse(await answered.json());
      await waitFor(async () => {
        const state = CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
        return state.issues.find((entry) => entry.number === issue)?.state === 'pr-open' ? true : null;
      }, TIMEOUT_MS, 'the answered issue to open its pull request');
      const after = CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
      expect(after.runs.find((run) => run.id === waiting.id)).toMatchObject({ status: 'succeeded', pendingQuestion: null });
      const resumed = agents.requests.filter((request) => request.role === 'implementer').at(-1);
      expect(resumed?.prompt).toContain('By team.');
    },
    TIMEOUT_MS * 2,
  );

  it(
    'abandons an escalated issue from the cockpit and never starts it again',
    async () => {
      agents.decisionsToAsk = 1;
      const issue = await rehearsal.addDocIssue('Document the on-call rota');
      await waitFor(async () => {
        const snapshot = CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
        return snapshot.issues.find((entry) => entry.number === issue)?.state === 'needs-human' ? true : null;
      }, TIMEOUT_MS, 'the issue to wait on the operator');

      const post = (body: unknown) => fetch(`${base}/api/commands/issue.abandon`, { method: 'POST', headers: commandHeaders, body: JSON.stringify(body) });
      expect((await post({ issueNumber: issue, reason: '  ' })).status).toBe(400);
      const abandoned = await post({ issueNumber: issue, reason: 'the rota moves to the wiki' });
      expect(abandoned.status).toBe(200);
      CommandAcceptedSchema.parse(await abandoned.json());
      const again = await post({ issueNumber: issue, reason: 'twice' });
      expect(again.status).toBe(409);
      expect(await again.json()).toMatchObject({ error: `Issue #${issue} cannot be abandoned: it is abandoned, not needs-human` });

      const rewrite = await fetch(`${base}/api/commands/issue.rewrite-check`, {
        method: 'POST',
        headers: commandHeaders,
        body: JSON.stringify({ issueNumber: issue, path: 'docs/rota.md', instruction: 'Assert the rota names a backup.' }),
      });
      expect(rewrite.status).toBe(409);
      expect(CommandRejectedSchema.parse(await rewrite.json()).error).toContain('it is abandoned');

      const requestsBefore = agents.requests.length;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      const snapshot = CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
      expect(snapshot.issues.find((entry) => entry.number === issue)).toMatchObject({ state: 'abandoned' });
      expect(agents.requests.length).toBe(requestsBefore);
    },
    TIMEOUT_MS * 2,
  );

  it('applies settings edits live without a restart, keeps a backup of each previous file and refuses values outside the bounds', async () => {
    const post = (name: string, body: unknown) => fetch(`${base}/api/commands/${name}`, { method: 'POST', headers: commandHeaders, body: JSON.stringify(body) });
    expect((await post('settings.update-role', { role: 'reviewer', model: 'sonnet', effort: 'medium', maxBudgetUsd: 2, maxTurns: 30 })).status).toBe(200);
    expect((await post('settings.update-limits', { concurrencyCeiling: 2, freeMemoryThresholdPercent: 35, pauseAbovePressure: 'warn' })).status).toBe(200);
    expect((await post('costs.update-caps', { dailyUsd: 20, perRunUsd: 3, pauseAtUtilization: 0.6 })).status).toBe(200);

    const snapshot = CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
    expect(snapshot.settings.roles.find((role) => role.role === 'reviewer')).toMatchObject({ model: 'sonnet', effort: 'medium', maxBudgetUsd: 2, maxTurns: 30 });
    expect(snapshot.settings.concurrency).toMatchObject({ ceiling: 2, maximum: 3 });
    expect(snapshot.settings.resourceGuard).toEqual({ freeMemoryThresholdPercent: 35, pauseAbovePressure: 'warn' });
    expect(snapshot.costs.caps).toEqual({ dailyUsd: 20, perRunUsd: 3, pauseAtUtilization: 0.6 });
    expect(runtime.daemon.concurrentIssues).toBe(2);
    expect(factory.admission.currentPolicy).toEqual({ minimumFreeMemoryPercent: 35, pauseAbovePressure: 'warn' });
    expect(factory.budget.perRunCapUsd).toBe(3);
    expect(factory.settings.roles.reviewer).toMatchObject({ model: 'sonnet', maxTurns: 30 });

    const text = await readFile(rehearsal.config.configPath, 'utf8');
    expect(text).toContain('reviewer: { model: sonnet, effort: medium, maxBudgetUsd: 2, maxTurns: 30, timeoutMinutes: 5 }');
    expect(await readdir(join(rehearsal.config.directories.state, 'config-backups'))).toHaveLength(3);
    const events = (await factory.dependencies.events.read('settings', 0)).map((record) => record.type);
    expect(events.filter((type) => type === 'settings.changed')).toHaveLength(3);
    expect(events).toContain('settings.configuration-reloaded');

    const critical = await post('settings.update-limits', { concurrencyCeiling: 1, freeMemoryThresholdPercent: 35, pauseAbovePressure: 'critical' });
    expect(critical.status).toBe(409);
    expect(CommandRejectedSchema.parse(await critical.json()).error).toContain('not critical');
    const beyondCeiling = await post('settings.update-limits', { concurrencyCeiling: 9, freeMemoryThresholdPercent: 35, pauseAbovePressure: 'normal' });
    expect(beyondCeiling.status).toBe(409);
    expect(CommandRejectedSchema.parse(await beyondCeiling.json()).error).toContain('concurrency.ceiling');
    expect(await readFile(rehearsal.config.configPath, 'utf8')).toBe(text);
  });

  it('tests a tool connection on order and shows the result in the settings', async () => {
    const tested = await fetch(`${base}/api/commands/settings.test-tool`, { method: 'POST', headers: commandHeaders, body: JSON.stringify({ tool: 'sandbox' }) });
    expect(tested.status).toBe(200);
    const snapshot = CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
    expect(snapshot.settings.tools).toEqual([expect.objectContaining({ tool: 'sandbox', status: 'connected', fixCommand: null })]);
  });

  it('redeploys DEV or PREP at the deployed version as a simulated dispatch, and never production', async () => {
    const deployments = join(rehearsal.config.github.local.directory, 'deployments');
    await mkdir(deployments, { recursive: true });
    const sha = rehearsal.pushDirectCommit('NOTES.md', 'notes\n', 'docs: add notes');
    await writeFile(
      join(deployments, 'widgets-dev.json'),
      JSON.stringify([{ id: 'd1', ref: 'main', sha, createdAt: '2026-10-10T07:00:00.000Z', creator: 'deployer', state: 'success', logUrl: null, environmentUrl: null }]),
    );
    const post = (body: unknown) => fetch(`${base}/api/commands/deployment.redeploy`, { method: 'POST', headers: commandHeaders, body: JSON.stringify(body) });
    const snapshot = CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
    const dev = snapshot.environments.find((environment) => environment.name === 'dev');
    expect(dev?.current?.version).toBe(sha.slice(0, 7));
    expect(snapshot.environments.map((environment) => environment.name)).toEqual(['dev', 'prep', 'prod']);

    expect((await post({ environment: 'prod', confirmVersion: sha.slice(0, 7) })).status).toBe(400);
    const unconfirmed = await post({ environment: 'dev', confirmVersion: 'abcdef0' });
    expect(unconfirmed.status).toBe(409);
    const redeployed = await post({ environment: 'dev', confirmVersion: sha.slice(0, 7) });
    expect(redeployed.status).toBe(200);
    const dispatch = JSON.parse(await readFile(join(rehearsal.config.github.local.directory, 'workflow-dispatches', '1.json'), 'utf8'));
    expect(dispatch).toMatchObject({ workflow: 'cloud-delivery.yml', ref: 'main', inputs: { environment_name: 'widgets-dev', build: 'skip', deploy: 'true' } });
    const recorded = await factory.dependencies.events.read('deployment/', 0);
    expect(recorded.map((record) => [record.type, record.subject])).toEqual([['deployment.redeploy-dispatched', 'deployment/dev']]);
    expect(recorded[0]?.payload).toMatchObject({ simulated: true, version: sha.slice(0, 7) });
  });

  it('refuses to cut a release whose gate is not promotable and names the blocking reasons', async () => {
    const pulls = join(rehearsal.config.github.local.directory, 'pulls');
    await mkdir(pulls, { recursive: true });
    const head = rehearsal.pushDirectCommit('CHANGELOG.md', '# 1.3.0\n', 'chore(main): release 1.3.0');
    execFileSync('git', ['push', '--quiet', 'origin', 'HEAD:refs/heads/release-please--branches--main'], { cwd: rehearsal.config.target.clonePath, stdio: 'ignore' });
    await writeFile(
      join(pulls, '7.json'),
      JSON.stringify({
        number: 7,
        title: 'chore(main): release 1.3.0',
        head: 'release-please--branches--main',
        base: 'main',
        labels: ['autorelease: pending'],
        closes: [],
        state: 'open',
        author: 'release-please',
        createdAt: '2026-10-10T07:00:00.000Z',
        mergeSha: null,
        mergedAt: null,
      }),
    );
    await factory.dependencies.events.append('release.detected', 'release/pr-7', {
      releaseId: 'pr-7',
      source: 'pull-request',
      ref: 'main',
      baseSha: null,
      headSha: head,
      pullRequestNumber: 7,
      title: 'chore(main): release 1.3.0',
    });
    const refused = await fetch(`${base}/api/commands/release.cut`, { method: 'POST', headers: commandHeaders, body: JSON.stringify({ releaseId: 'pr-7' }) });
    expect(refused.status).toBe(409);
    expect(CommandRejectedSchema.parse(await refused.json()).error).toContain('no PREP health check has been recorded');
    expect((await factory.dependencies.events.read('release/pr-7', 0)).map((record) => record.type)).toContain('release.evaluated');
  });

  it('answers unknown, refused and malformed commands, and guards files', async () => {
    const post = (name: string, body: string) => fetch(`${base}/api/commands/${name}`, { method: 'POST', headers: commandHeaders, body });
    const unknown = await post('nope', '{}');
    expect(unknown.status).toBe(404);
    const cut = await post('release.cut', '{"releaseId":"pr-404"}');
    expect(cut.status).toBe(409);
    expect(await cut.json()).toEqual({ error: 'release pr-404 was never detected', command: 'release.cut' });
    const malformed = await post('pr.merge', '{"number": "one"}');
    expect(malformed.status).toBe(400);
    expect(CommandRejectedSchema.parse(await malformed.json()).error).toContain('invalid body');
    const refused = await post('request.challenge', '{"requestId":"req-9"}');
    expect(refused.status).toBe(409);

    expect(await (await fetch(`${base}/`)).text()).toBe(COCKPIT_PAGE.replace('</head>', `<meta name="${COMMAND_TOKEN_META_NAME}" content="${commandHeaders[COMMAND_TOKEN_HEADER]}"></head>`));
    expect(TOKEN_META.test(await (await fetch(`${base}/issues/42`)).text())).toBe(true);
    expect((await fetch(`${base}/assets/app.js`)).headers.get('content-type')).toContain('text/javascript');
    expect((await fetch(`${base}/api/evidence/1/..%2F..%2Fconfig.yaml`)).status).toBe(404);
    expect((await fetch(`${base}/api/events?after=x`)).status).toBe(400);
  });

  it('refuses a command that lacks the per-process token, and never serves the token outside the cockpit page', async () => {
    const body = JSON.stringify({});
    const without = await fetch(`${base}/api/commands/scheduler.pause`, { method: 'POST', body });
    expect(without.status).toBe(403);
    const wrong = await fetch(`${base}/api/commands/scheduler.pause`, { method: 'POST', body, headers: { [COMMAND_TOKEN_HEADER]: 'f'.repeat(64) } });
    expect(wrong.status).toBe(403);
    expect(CommandRejectedSchema.parse(await wrong.json()).error).toContain(COMMAND_TOKEN_HEADER);
    expect(CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json()).factory.schedulerPaused).toBe(false);
    const token = commandHeaders[COMMAND_TOKEN_HEADER] ?? '';
    for (const path of ['/api/state', '/assets/app.js']) expect(await (await fetch(`${base}${path}`)).text()).not.toContain(token);
  });

  it('refuses requests without a Tailscale identity once a tailnet is configured', async () => {
    const guarded = createHttpServer(
      { ...factory, config: { ...factory.config, server: { ...factory.config.server, tailnet: true } } },
      null,
      { cockpitDirectory: join(rehearsal.root, 'cockpit-dist') },
    );
    const address = await guarded.start();
    try {
      const url = `http://127.0.0.1:${address.port}/api/state`;
      expect((await fetch(url)).status).toBe(403);
      expect((await fetch(url, { headers: { 'Tailscale-User-Login': 'operator@example.test' } })).status).toBe(200);
    } finally {
      await guarded.stop();
    }
  });
});
