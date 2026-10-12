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
  RunLogLineSchema,
  RunLogPageSchema,
  StreamEventSchema,
  TelemetrySampleSchema,
  type CockpitSnapshot,
  type ProjectView,
} from '@agent-factory/cockpit';
import { RUN_SUBJECT_PREFIX } from '@agent-factory/application';
import { openInstallation, type InstallationRuntime } from '../composition/installation/installation-runtime.ts';
import { SILENT_LOG } from '../composition/operation-log.ts';
import { createHttpServer, startFactory, type RunningFactory } from '../composition/runtime.ts';
import { DECISION_QUESTION, RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, SECOND_PROJECT, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';

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

function projectIn(snapshot: CockpitSnapshot, id: string): ProjectView {
  const project = snapshot.projects.find((candidate) => candidate.id === id);
  if (project === undefined) throw new Error(`the snapshot has no project ${id}`);
  return project;
}

/** Delivery of the first project: a development environment the factory may redeploy, a pre-production one with a health check that cannot answer, and production. */
const DELIVERY = {
  delivery: {
    release: { kind: 'release-please' },
    environments: [
      {
        name: 'dev',
        promotion: 'automatic',
        deployments: { kind: 'github', environment: 'widgets-dev' },
        redeploy: { workflow: 'cloud-delivery.yml', inputs: { environment_name: '{{target}}', build: 'skip', deploy: 'true' } },
      },
      { name: 'prep', promotion: 'batch', deployments: { kind: 'github', environment: 'widgets-prep' }, health: [{ name: 'ui', url: 'http://127.0.0.1:9/healthz' }], wakeUpSeconds: 0 },
      { name: 'prod', promotion: 'manual', production: true, deployments: { kind: 'github', environment: 'widgets-prod' } },
    ],
  },
};

describe('the factory HTTP server end to end, with two projects', () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  let running: RunningFactory;
  let controller: AbortController;
  let base: string;
  let commandHeaders: Record<string, string>;
  let agents: RehearsalAgents;

  const state = async (): Promise<CockpitSnapshot> => CockpitSnapshotSchema.parse(await (await fetch(`${base}/api/state`)).json());
  const post = (name: string, body: unknown) => fetch(`${base}/api/commands/${name}`, { method: 'POST', headers: commandHeaders, body: JSON.stringify(body) });

  beforeEach(async () => {
    rehearsal = await createRehearsal({ projects: [FIRST_PROJECT, SECOND_PROJECT], projectSettings: { [FIRST_PROJECT]: DELIVERY } });
    agents = new RehearsalAgents();
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => agents,
      resources: NORMAL_RESOURCES,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [{ kind: 'weekly_all', scope: null, utilization: 0.2, resetsAt: null }] }) },
      fetch: () => Promise.resolve({ status: 200 }),
      log: SILENT_LOG,
      userHome: rehearsal.root,
    });
    const cockpitDirectory = join(rehearsal.root, 'cockpit-dist');
    await mkdir(join(cockpitDirectory, 'assets'), { recursive: true });
    await writeFile(join(cockpitDirectory, 'index.html'), COCKPIT_PAGE);
    await writeFile(join(cockpitDirectory, 'assets', 'app.js'), 'console.log(1);');
    controller = new AbortController();
    running = await startFactory(installation, controller.signal, { stream: FAST_STREAM, cockpitDirectory });
    base = `http://127.0.0.1:${running.address.port}`;
    commandHeaders = { [COMMAND_TOKEN_HEADER]: TOKEN_META.exec(await (await fetch(`${base}/`)).text())?.[1] ?? '', 'content-type': 'application/json' };
  });

  afterEach(async () => {
    controller.abort();
    await running.finished;
    installation.close();
    await rehearsal.cleanup();
  });

  it(
    'serves a snapshot the cockpit accepts, streams the factory live and keeps each project to its own work',
    async () => {
      const initial = await state();
      expect(initial.projects.map((project) => [project.id, project.forge.kind])).toEqual([
        [FIRST_PROJECT, 'local'],
        [SECOND_PROJECT, 'local'],
      ]);
      const stream = new FrameReader();
      await stream.open(`${base}/api/events?after=${initial.sequence}`);
      const issue = await rehearsal.project(FIRST_PROJECT).addDocIssue('Document the cockpit');
      const opened = await waitFor(
        async () => stream.find('factory', (data) => typed(data, 'issue.transitioned') && StreamEventSchema.parse(data).summary.endsWith('pr-open')),
        TIMEOUT_MS,
        'the pull request to open',
      );
      expect(StreamEventSchema.parse(opened)).toMatchObject({ project: FIRST_PROJECT, subject: `issue/${issue}` });
      expect(StreamEventSchema.parse(stream.find('factory', (data) => typed(data, 'run.started')))).toMatchObject({ project: null, summary: expect.stringContaining('acceptance-author run started') });
      expect(RunLogLineSchema.parse(stream.find('run-log', () => true))).toMatchObject({ index: 0 });
      await waitFor(async () => stream.find('telemetry', () => true), TIMEOUT_MS, 'a telemetry sample');
      expect(TelemetrySampleSchema.parse(stream.find('telemetry', () => true)).resources.sample.value?.pressure).toBe('normal');

      const snapshot = await state();
      const widgets = projectIn(snapshot, FIRST_PROJECT);
      expect(widgets.issues.find((entry) => entry.number === issue)?.state).toBe('pr-open');
      expect(widgets.pullRequests).toHaveLength(1);
      expect(projectIn(snapshot, SECOND_PROJECT).issues).toEqual([]);
      expect(snapshot.runs.length).toBeGreaterThanOrEqual(3);
      expect(new Set(snapshot.runs.map((run) => run.project))).toEqual(new Set([FIRST_PROJECT]));
      const run = snapshot.runs.at(-1);
      const page = RunLogPageSchema.parse(await (await fetch(`${base}/api/runs/${run?.id ?? ''}/log?after=0`)).json());
      expect(page.lines.map((line) => line.index)).toEqual(page.lines.map((_line, position) => position + 1));
      expect(snapshot.usage.accounts[0]).toMatchObject({ name: 'default', source: 'agent-stream', limits: expect.arrayContaining([expect.objectContaining({ kind: 'weekly_all', utilization: 0.2 })]) });

      const paused = CommandAcceptedSchema.parse(await (await post('scheduler.pause', { project: SECOND_PROJECT })).json());
      expect(paused.effect).toBe(`No new work starts for ${SECOND_PROJECT}; running issues finish their current step`);
      const after = await state();
      expect(after.sequence).toBeGreaterThanOrEqual(paused.sequence ?? 0);
      expect(projectIn(after, SECOND_PROJECT).pauses.map((pause) => pause.cause)).toEqual(['operator']);
      expect(projectIn(after, FIRST_PROJECT).pauses).toEqual([]);
      expect(after.installation.pauses).toEqual([]);
      stream.close();
    },
    TIMEOUT_MS * 2,
  );

  it(
    'shows an implementer question as waiting on the operator and resumes the issue with the answer',
    async () => {
      agents.decisionsToAsk = 1;
      const issue = await rehearsal.project(SECOND_PROJECT).addDocIssue('Document the release owners');
      const waiting = await waitFor(async () => (await state()).runs.find((candidate) => candidate.pendingQuestion !== null) ?? null, TIMEOUT_MS, 'the waiting run');
      expect(waiting).toMatchObject({ role: 'implementer', status: 'waiting', outcome: 'decision-requested', project: SECOND_PROJECT });
      expect(waiting.pendingQuestion?.text).toBe(DECISION_QUESTION);
      expect(projectIn(await state(), SECOND_PROJECT).issues.find((entry) => entry.number === issue)).toMatchObject({ state: 'needs-human', resumeTarget: 'implementing' });

      const answered = await post('run.answer', { runId: waiting.id, questionId: waiting.pendingQuestion?.id ?? '', answer: 'By team.' });
      expect(answered.status).toBe(200);
      CommandAcceptedSchema.parse(await answered.json());
      await waitFor(
        async () => (projectIn(await state(), SECOND_PROJECT).issues.find((entry) => entry.number === issue)?.state === 'pr-open' ? true : null),
        TIMEOUT_MS,
        'the answered issue to open its pull request',
      );
      expect((await state()).runs.find((candidate) => candidate.id === waiting.id)).toMatchObject({ status: 'succeeded', pendingQuestion: null });
      expect(agents.requests.filter((request) => request.role === 'implementer').at(-1)?.prompt).toContain('By team.');
    },
    TIMEOUT_MS * 2,
  );

  it(
    'abandons an escalated issue from the cockpit and never starts it again',
    async () => {
      agents.decisionsToAsk = 1;
      const issue = await rehearsal.project(FIRST_PROJECT).addDocIssue('Document the on-call rota');
      await waitFor(
        async () => (projectIn(await state(), FIRST_PROJECT).issues.find((entry) => entry.number === issue)?.state === 'needs-human' ? true : null),
        TIMEOUT_MS,
        'the issue to wait on the operator',
      );
      expect((await post('issue.abandon', { project: FIRST_PROJECT, issueNumber: issue, reason: '  ' })).status).toBe(400);
      const abandoned = await post('issue.abandon', { project: FIRST_PROJECT, issueNumber: issue, reason: 'the rota moves to the wiki' });
      expect(abandoned.status).toBe(200);
      expect(CommandAcceptedSchema.parse(await abandoned.json()).effect).toContain(`Issue #${issue} abandoned`);
      const again = await post('issue.abandon', { project: FIRST_PROJECT, issueNumber: issue, reason: 'twice' });
      expect(again.status).toBe(409);
      expect(await again.json()).toMatchObject({ error: `Issue #${issue} cannot be abandoned: it is abandoned, not needs-human` });
      const rewrite = await post('issue.rewrite-check', { project: FIRST_PROJECT, issueNumber: issue, path: 'docs/rota.md', instruction: 'Assert the rota names a backup.' });
      expect(rewrite.status).toBe(409);
      expect(CommandRejectedSchema.parse(await rewrite.json()).error).toContain('it is abandoned');

      const requestsBefore = agents.requests.length;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      expect(projectIn(await state(), FIRST_PROJECT).issues.find((entry) => entry.number === issue)).toMatchObject({ state: 'abandoned' });
      expect(agents.requests.length).toBe(requestsBefore);
    },
    TIMEOUT_MS * 2,
  );

  it('applies settings edits live, keeps a backup of each previous file and refuses values outside the bounds', async () => {
    const reviewer = { role: 'reviewer', model: 'sonnet', effort: 'medium', maxBudgetUsd: 2, maxTurns: 30 };
    expect((await post('settings.update-role', { project: FIRST_PROJECT, change: reviewer })).status).toBe(200);
    expect((await post('settings.update-resources', { minimumFreeMemoryPercent: 35, pauseAbovePressure: 'warn', maxConcurrentRuns: 2 })).status).toBe(200);
    expect((await post('settings.update-budget', { dailyCapUsd: 20, perRunCapUsd: 3 })).status).toBe(200);
    expect((await post('settings.update-concurrency', { project: SECOND_PROJECT, issues: 2, ceiling: 3 })).status).toBe(200);

    const snapshot = await state();
    expect(projectIn(snapshot, FIRST_PROJECT).settings.roles.find((role) => role.role === 'reviewer')).toMatchObject({ model: 'sonnet', effort: 'medium', maxBudgetUsd: 2, maxTurns: 30 });
    expect(projectIn(snapshot, SECOND_PROJECT).settings.roles.find((role) => role.role === 'reviewer')).toMatchObject({ model: 'haiku' });
    expect(projectIn(snapshot, SECOND_PROJECT).settings.concurrency).toMatchObject({ issues: 2, ceiling: 3 });
    expect(snapshot.resources).toMatchObject({ minimumFreeMemoryPercent: 35, pauseAbovePressure: 'warn' });
    expect(snapshot.costs).toMatchObject({ dailyCap: { kind: 'usd', amount: 20 }, perRunCapUsd: 3 });
    expect(snapshot.installation.runSlots.limit).toBe(2);
    expect(installation.project(FIRST_PROJECT).config.roles.reviewer).toMatchObject({ model: 'sonnet', maxTurns: 30 });
    expect(installation.budget.runBudgetUsd(10)).toBe(3);

    const text = await readFile(rehearsal.config.configPath, 'utf8');
    expect(await readdir(join(rehearsal.config.directories.state, 'config-backups'))).toHaveLength(4);
    const events = (await installation.events.read('settings', 0)).map((record) => record.type);
    expect(events.filter((type) => type === 'settings.changed')).toHaveLength(4);

    const critical = await post('settings.update-resources', { minimumFreeMemoryPercent: 35, pauseAbovePressure: 'critical', maxConcurrentRuns: 1 });
    expect(critical.status).toBe(409);
    expect(CommandRejectedSchema.parse(await critical.json()).error).toContain('critical');
    const beyondCeiling = await post('settings.update-concurrency', { project: SECOND_PROJECT, issues: 9, ceiling: 3 });
    expect(beyondCeiling.status).toBe(409);
    expect(await readFile(rehearsal.config.configPath, 'utf8')).toBe(text);
  });

  it('checks a tool on order and shows the result with the time it was read', async () => {
    const checked = await post('tools.check', { project: null, tool: 'sandbox' });
    expect(checked.status).toBe(200);
    expect(CommandAcceptedSchema.parse(await checked.json()).effect).toMatch(/^sandbox: connected/);
    const tool = (await state()).tools.find((entry) => entry.name === 'sandbox');
    expect(tool).toMatchObject({ scope: 'installation', builtIn: true, status: 'connected', fixCommand: null });
    expect(tool?.checkedAt).not.toBeNull();
  });

  it('redeploys a development environment at the deployed version as a simulated dispatch, and never production', async () => {
    const widgets = rehearsal.project(FIRST_PROJECT);
    const forge = widgets.config.forge.kind === 'local' ? widgets.config.forge.directory : '';
    await mkdir(join(forge, 'deployments'), { recursive: true });
    const sha = widgets.pushDirectCommit('NOTES.md', 'notes\n', 'docs: add notes');
    await writeFile(
      join(forge, 'deployments', 'widgets-dev.json'),
      JSON.stringify([{ id: 'd1', ref: 'main', sha, createdAt: '2026-10-10T07:00:00.000Z', creator: 'deployer', state: 'success', logUrl: null, environmentUrl: null }]),
    );
    const environments = projectIn(await state(), FIRST_PROJECT).environments;
    expect(environments.map((environment) => [environment.name, environment.production, environment.redeployable])).toEqual([
      ['dev', false, true],
      ['prep', false, false],
      ['prod', true, false],
    ]);
    expect(environments[0]?.deployments?.value?.current?.version).toBe(sha.slice(0, 7));

    expect((await post('deployment.redeploy', { project: FIRST_PROJECT, environment: 'prod', confirmVersion: sha.slice(0, 7) })).status).toBe(409);
    expect((await post('deployment.redeploy', { project: FIRST_PROJECT, environment: 'dev', confirmVersion: 'abcdef0' })).status).toBe(409);
    const redeployed = await post('deployment.redeploy', { project: FIRST_PROJECT, environment: 'dev', confirmVersion: sha.slice(0, 7) });
    expect(redeployed.status).toBe(200);
    expect(CommandAcceptedSchema.parse(await redeployed.json()).effect).toContain('(simulated by the local forge)');
    const dispatch: unknown = JSON.parse(await readFile(join(forge, 'workflow-dispatches', '1.json'), 'utf8'));
    expect(dispatch).toMatchObject({ workflow: 'cloud-delivery.yml', inputs: { environment_name: 'widgets-dev', build: 'skip', deploy: 'true' } });
    const recorded = await installation.project(FIRST_PROJECT).dependencies.events.read('deployment/', 0);
    expect(recorded.map((record) => [record.type, record.subject])).toEqual([['deployment.redeploy-dispatched', 'deployment/dev']]);
  });

  it('refuses to cut a release whose gate is not promotable and names the blocking reasons', async () => {
    const widgets = rehearsal.project(FIRST_PROJECT);
    const forge = widgets.config.forge.kind === 'local' ? widgets.config.forge.directory : '';
    await mkdir(join(forge, 'pulls'), { recursive: true });
    const head = widgets.pushDirectCommit('CHANGELOG.md', '# 1.3.0\n', 'chore(main): release 1.3.0');
    execFileSync('git', ['push', '--quiet', 'origin', 'HEAD:refs/heads/release-please--branches--main'], { cwd: widgets.config.clonePath, stdio: 'ignore' });
    await writeFile(
      join(forge, 'pulls', '7.json'),
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
    const events = installation.project(FIRST_PROJECT).dependencies.events;
    await events.append('release.detected', 'release/pr-7', {
      releaseId: 'pr-7',
      source: 'pull-request',
      ref: 'main',
      baseSha: null,
      headSha: head,
      pullRequestNumber: 7,
      title: 'chore(main): release 1.3.0',
      createdAt: '2026-10-10T07:00:00.000Z',
      supersededBy: null,
    });
    const refused = await post('release.cut', { project: FIRST_PROJECT, releaseId: 'pr-7' });
    expect(refused.status).toBe(409);
    expect(CommandRejectedSchema.parse(await refused.json()).error).toContain('prep');
    expect((await events.read('release/pr-7', 0)).map((record) => record.type)).toContain('release.evaluated');
    expect(projectIn(await state(), FIRST_PROJECT).releases.find((release) => release.id === 'pr-7')).toMatchObject({ state: 'open', gate: { promotable: false }, createdAt: '2026-10-10T07:00:00.000Z' });
  });

  it('answers unknown, refused and malformed commands, and serves only the files of a known project', async () => {
    const raw = (name: string, body: string) => fetch(`${base}/api/commands/${name}`, { method: 'POST', headers: commandHeaders, body });
    const unknown = await raw('nope', '{}');
    expect(unknown.status).toBe(404);
    const cut = await raw('release.cut', JSON.stringify({ project: FIRST_PROJECT, releaseId: 'pr-404' }));
    expect(cut.status).toBe(409);
    expect(await cut.json()).toEqual({ error: 'release pr-404 was never detected', command: 'release.cut' });
    const malformed = await raw('pr.merge', JSON.stringify({ project: FIRST_PROJECT, number: 'one' }));
    expect(malformed.status).toBe(400);
    expect(CommandRejectedSchema.parse(await malformed.json()).error).toContain('invalid body');
    const elsewhere = await raw('scheduler.pause', JSON.stringify({ project: 'nope' }));
    expect(elsewhere.status).toBe(409);
    expect(CommandRejectedSchema.parse(await elsewhere.json()).error).toContain('no project "nope"');

    expect(await (await fetch(`${base}/`)).text()).toBe(COCKPIT_PAGE.replace('</head>', `<meta name="${COMMAND_TOKEN_META_NAME}" content="${commandHeaders[COMMAND_TOKEN_HEADER]}"></head>`));
    expect(TOKEN_META.test(await (await fetch(`${base}/projects/widgets/issues`)).text())).toBe(true);
    expect((await fetch(`${base}/assets/app.js`)).headers.get('content-type')).toContain('text/javascript');
    expect((await fetch(`${base}/api/projects/${FIRST_PROJECT}/evidence/1/..%2F..%2Fconfig.yaml`)).status).toBe(404);
    expect((await fetch(`${base}/api/projects/nope/evidence/1/report.md`)).status).toBe(404);
    expect((await fetch(`${base}/api/events?after=x`)).status).toBe(400);
    expect((await installation.events.read(RUN_SUBJECT_PREFIX, 0)).length).toBe(0);
  });

  it('refuses a command that lacks the per-process token, and never serves the token outside the cockpit page', async () => {
    const body = JSON.stringify({ project: null });
    expect((await fetch(`${base}/api/commands/scheduler.pause`, { method: 'POST', body })).status).toBe(403);
    const wrong = await fetch(`${base}/api/commands/scheduler.pause`, { method: 'POST', body, headers: { [COMMAND_TOKEN_HEADER]: 'f'.repeat(64) } });
    expect(wrong.status).toBe(403);
    expect(CommandRejectedSchema.parse(await wrong.json()).error).toContain(COMMAND_TOKEN_HEADER);
    expect((await state()).installation.pauses).toEqual([]);
    const token = commandHeaders[COMMAND_TOKEN_HEADER] ?? '';
    for (const path of ['/api/state', '/assets/app.js']) expect(await (await fetch(`${base}${path}`)).text()).not.toContain(token);
  });

  it('refuses requests without an allowed Tailscale identity once remote access goes through the tailnet', async () => {
    const tailnet = { ...installation.config.server, remoteAccess: { kind: 'tailscale' as const, allowedLogins: ['alex@example.com'] } };
    const guarded = createHttpServer({ ...installation, config: { ...installation.config, server: tailnet } }, null, { cockpitDirectory: join(rehearsal.root, 'cockpit-dist') });
    const address = await guarded.start();
    try {
      const url = `http://127.0.0.1:${address.port}/api/state`;
      expect((await fetch(url)).status).toBe(403);
      expect((await fetch(url, { headers: { 'Tailscale-User-Login': 'riley@example.com' } })).status).toBe(403);
      expect((await fetch(url, { headers: { 'Tailscale-User-Login': 'alex@example.com' } })).status).toBe(200);
    } finally {
      await guarded.stop();
    }
  });
});
