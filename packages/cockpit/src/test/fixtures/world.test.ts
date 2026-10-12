import { describe, expect, it } from 'vitest';
import { CockpitSnapshotSchema, RunLogLineSchema, StreamEventSchema, type RunLogEvent, type RunLogLine } from '../../contract/index.ts';
import { HOUR_MS, MINUTE_MS, SECOND_MS } from './time.ts';
import { mapProject, mapRuns } from './mutate.ts';
import { duplicates, ledger, NOW, required, runNamed, snapshot, storefront, world } from './suites/world-under-test.ts';
import { buildWorld, INITIAL_SEQUENCE, LEDGER_ID, STOREFRONT_ID } from './world.ts';
import './suites/work.ts';
import './suites/delivery.ts';
import './suites/installation.ts';
import { RUN as STOREFRONT_RUN } from './storefront/ids.ts';

const LOGGED_RUN_IDS = [STOREFRONT_RUN.statusFilterImplementer, STOREFRONT_RUN.promoSavingsAsk, STOREFRONT_RUN.expiredPromoImplementer, STOREFRONT_RUN.searchReviewTwo];
const RECENT_LINE_MS = 30 * SECOND_MS;
const ACTIVITY_MINIMUM = 25;
const ACTIVITY_MAXIMUM = 30;

function kindsOf(lines: readonly RunLogLine[]): Set<RunLogEvent['kind']> {
  return new Set(lines.map((line) => line.event.kind));
}

function linesOf(runId: string): readonly RunLogLine[] {
  return required(world.logs.get(runId), `log of ${runId}`);
}

describe('the snapshot of the world', () => {
  it('is a valid cockpit snapshot', () => {
    expect(() => CockpitSnapshotSchema.parse(snapshot)).not.toThrow();
  });

  it('is a pure function of the instant it is built at', () => {
    expect(buildWorld(NOW)).toEqual(world);
    const later = buildWorld(NOW + HOUR_MS);
    expect(() => CockpitSnapshotSchema.parse(later.snapshot)).not.toThrow();
    expect(Date.parse(later.snapshot.generatedAt) - Date.parse(snapshot.generatedAt)).toBe(HOUR_MS);
    const startedFor = (value: typeof snapshot): number => Date.parse(value.generatedAt) - Date.parse(required(value.installation.startedAt, 'start time'));
    expect(startedFor(later.snapshot)).toBe(startedFor(snapshot));
  });

  it.each(['2026-10-12T10:00:00.000Z', '2026-11-01T00:00:00.000Z', '2027-03-01T23:59:59.999Z', '2028-02-29T12:30:00.000Z'])('is valid at %s', (instant) => {
    const built = buildWorld(Date.parse(instant));
    expect(() => CockpitSnapshotSchema.parse(built.snapshot)).not.toThrow();
    expect(built.snapshot.generatedAt).toBe(instant);
    expect(built.snapshot.installation.runSlots.running).toBe(2);
    expect(built.snapshot.costs.daily).toHaveLength(14);
  });

  it('names the installation operator and its two projects', () => {
    expect(snapshot.installation.operator).toBe('Alex Morgan');
    expect(snapshot.installation.mode).toBe('live');
    expect(snapshot.sequence).toBe(INITIAL_SEQUENCE);
    expect(snapshot.projects.map((project) => project.id)).toEqual([STOREFRONT_ID, LEDGER_ID]);
  });
});

describe('the run logs', () => {
  it('have a valid, contiguous and time-ordered line for every position', () => {
    for (const [runId, lines] of world.logs) {
      lines.forEach((line, position) => {
        expect(() => RunLogLineSchema.parse(line)).not.toThrow();
        expect(line.runId).toBe(runId);
        expect(line.index).toBe(position);
        if (position > 0) expect(Date.parse(line.at)).toBeGreaterThan(Date.parse(required(lines[position - 1], 'previous line').at));
      });
    }
  });

  it('exist for the four runs that have one, and the length of the others is zero', () => {
    expect([...world.logs.keys()].sort()).toEqual([...LOGGED_RUN_IDS].sort());
    for (const run of snapshot.runs) expect(run.logLength).toBe(world.logs.get(run.id)?.length ?? 0);
  });

  it('agree with the run they belong to', () => {
    for (const [runId, lines] of world.logs) {
      const run = runNamed(runId);
      const totals = lines.flatMap((line) => (line.event.kind === 'usage' || line.event.kind === 'progress' ? [line.event] : []));
      const last = required(totals.at(-1), 'usage report');
      expect(run.usage).toEqual(last.usage);
      expect(run.turns).toBe(last.turns);
      const reported = lines.flatMap((line) => (line.event.kind === 'usage' ? [line.event] : []));
      expect(run.costUsd).toBe(required(reported.at(-1), 'cost report').costUsd);
      expect(Date.parse(required(lines[0], 'first line').at)).toBeGreaterThanOrEqual(Date.parse(run.startedAt));
      if (run.endedAt !== null) expect(Date.parse(required(lines.at(-1), 'last line').at)).toBeLessThanOrEqual(Date.parse(run.endedAt));
    }
  });

  it('show a running session that is working on a tool call a moment ago', () => {
    const run = runNamed(STOREFRONT_RUN.statusFilterImplementer);
    const lines = linesOf(run.id);
    const last = required(lines.at(-1), 'last line');
    expect(run.status).toBe('running');
    expect(last.event.kind).toBe('tool-call');
    expect(NOW - Date.parse(last.at)).toBeLessThan(RECENT_LINE_MS);
    expect(run.currentTool).toBe('Read');
    expect(run.subagents.map((subagent) => subagent.status)).toEqual(['running', 'running']);
    expect(run.lastLine).toBe('Read · web/src/design/Select.tsx');
  });

  it('end with the question of the session that waits for the operator', () => {
    const run = runNamed(STOREFRONT_RUN.promoSavingsAsk);
    const last = required(linesOf(run.id).at(-1), 'last line').event;
    const question = required(run.pendingQuestion, 'pending question');
    expect(run.status).toBe('waiting');
    expect(run.outcome).toBe('decision-requested');
    expect(last.kind === 'assistant-text' && last.text.includes(question.text.split('. ').at(-1) ?? '')).toBe(true);
    expect(question.options.length).toBeGreaterThanOrEqual(2);
    expect(question.askedAt).toBe(run.endedAt);
  });

  it('contain every kind of event in the finished implementer session', () => {
    const lines = linesOf(STOREFRONT_RUN.expiredPromoImplementer);
    expect(kindsOf(lines)).toEqual(new Set(['session-started', 'assistant-text', 'tool-call', 'tool-result', 'permission-denied', 'hook', 'rate-limit', 'gate', 'usage', 'progress', 'raw']));
    const events = lines.map((line) => line.event);
    expect(events.some((event) => event.kind === 'tool-result' && event.isError)).toBe(true);
    const subagentCall = required(events.find((event) => event.kind === 'tool-call' && event.toolName === 'Task'), 'Task call');
    expect(events.some((event) => event.kind === 'tool-call' && event.parentToolUseId !== null && subagentCall.kind === 'tool-call' && event.parentToolUseId === subagentCall.toolUseId)).toBe(true);
    const windows = events.flatMap((event) => (event.kind === 'rate-limit' ? event.snapshots.map((entry) => entry.window) : []));
    expect(new Set(windows)).toEqual(new Set(['five_hour', 'seven_day']));
    const gates = events.flatMap((event) => (event.kind === 'gate' ? [event] : []));
    expect(gates.map((gate) => gate.passed)).toEqual([false, true]);
    expect(new Set(gates.flatMap((gate) => gate.steps.map((step) => step.outcome)))).toEqual(new Set(['passed', 'failed', 'skipped']));
    const raw = events.flatMap((event) => (event.kind === 'raw' ? [JSON.parse(event.line) as { type?: string }] : []));
    expect(raw.length).toBeGreaterThanOrEqual(3);
    expect(raw.every((line) => line.type === 'system')).toBe(true);
  });

  it('keep the reviewer answer as a fenced block of findings', () => {
    const lines = linesOf(STOREFRONT_RUN.searchReviewTwo);
    const answer = required(lines.findLast((line) => line.event.kind === 'assistant-text'), 'last text').event;
    expect(answer.kind === 'assistant-text' && answer.text.startsWith('```json')).toBe(true);
    expect(runNamed(STOREFRONT_RUN.searchReviewTwo).role).toBe('reviewer');
  });
});

describe('the identifiers of the world', () => {
  it('are unique where they must be', () => {
    expect(duplicates(snapshot.runs.map((run) => run.id))).toEqual([]);
    for (const project of snapshot.projects) {
      expect(duplicates(project.issues.map((issue) => issue.number))).toEqual([]);
      expect(duplicates(project.pullRequests.map((pullRequest) => pullRequest.number))).toEqual([]);
      expect(duplicates(project.releases.map((release) => release.id))).toEqual([]);
      expect(duplicates(project.audits.map((audit) => audit.id))).toEqual([]);
      expect(duplicates(project.requests.map((request) => request.id))).toEqual([]);
      expect(duplicates(project.environments.map((environment) => environment.name))).toEqual([]);
    }
  });

  it('share the numbering of a forge between issues, pull requests and release pull requests', () => {
    for (const project of snapshot.projects) {
      const outsidePullRequests = new Set([
        ...project.skippedChanges.flatMap((change) => (change.pullRequestNumber === null ? [] : [change.pullRequestNumber])),
        ...project.audits.flatMap((audit) => (audit.pullRequestNumber === null || project.pullRequests.some((pull) => pull.number === audit.pullRequestNumber) ? [] : [audit.pullRequestNumber])),
      ]);
      const numbers = [
        ...project.issues.map((issue) => issue.number),
        ...project.pullRequests.map((pullRequest) => pullRequest.number),
        ...project.releases.flatMap((release) => (release.pullRequestNumber === null ? [] : [release.pullRequestNumber])),
        ...outsidePullRequests,
      ];
      expect(duplicates(numbers)).toEqual([]);
    }
  });

  it('repeat issue numbers across projects, which every view must therefore scope', () => {
    const storefrontNumbers = new Set(storefront.issues.map((issue) => issue.number));
    const shared = ledger.issues.map((issue) => issue.number).filter((number) => storefrontNumbers.has(number));
    expect(shared.length).toBeGreaterThanOrEqual(2);
    expect(shared).toContain(12);
    const storefrontPulls = new Set(storefront.pullRequests.map((pull) => pull.number));
    expect(ledger.pullRequests.some((pull) => storefrontPulls.has(pull.number))).toBe(true);
    const storefrontRequests = new Set(storefront.requests.map((request) => request.id));
    expect(ledger.requests.some((request) => storefrontRequests.has(request.id))).toBe(true);
  });
});

describe('the references of the world', () => {
  it('link every pull request and its issue in both directions', () => {
    for (const project of snapshot.projects) {
      for (const pullRequest of project.pullRequests) {
        const issue = required(project.issues.find((candidate) => candidate.number === pullRequest.issueNumber), `issue of pull request ${pullRequest.number}`);
        expect(issue.pullRequestNumber).toBe(pullRequest.number);
        expect(issue.branch).toBe(pullRequest.branch);
        expect(pullRequest.branch.startsWith(project.settings.branchPrefix)).toBe(true);
      }
      for (const issue of project.issues) {
        if (issue.pullRequestNumber !== null) expect(project.pullRequests.some((pullRequest) => pullRequest.number === issue.pullRequestNumber)).toBe(true);
      }
    }
  });

  it('declare exactly one dependency on an issue that does not exist', () => {
    const dangling = snapshot.projects.flatMap((project) =>
      project.issues.flatMap((issue) => issue.dependsOn.filter((number) => !project.issues.some((candidate) => candidate.number === number)).map((number) => `${project.id}#${issue.number}->${number}`)),
    );
    expect(dangling).toEqual(['ledger#30->31']);
    expect(storefront.issues.some((issue) => issue.number === 31)).toBe(true);
  });

  it('give every run a subject of its own project', () => {
    for (const run of snapshot.runs) {
      if (run.project === null) continue;
      const project = required(snapshot.projects.find((candidate) => candidate.id === run.project), `project of ${run.id}`);
      const { kind, id } = run.subject;
      const exists =
        (kind === 'issue' && project.issues.some((issue) => String(issue.number) === id)) ||
        (kind === 'request' && project.requests.some((request) => request.id === id)) ||
        (kind === 'audit' && project.audits.some((audit) => audit.id === id)) ||
        (kind === 'release' && project.releases.some((release) => release.id === id));
      expect([run.id, kind, id, exists]).toEqual([run.id, kind, id, true]);
    }
  });

  it('keep every run an issue, a review, a challenge or an audit mentions in the runs of the snapshot', () => {
    const known = new Set(snapshot.runs.map((run) => run.id));
    for (const project of snapshot.projects) {
      for (const issue of project.issues) {
        for (const attempt of issue.attempts) {
          expect(known.has(attempt.runId)).toBe(true);
          const run = runNamed(attempt.runId);
          expect([run.role, run.subject.id, run.project]).toEqual(['implementer', String(issue.number), project.id]);
          expect([attempt.startedAt, attempt.endedAt, attempt.model]).toEqual([run.startedAt, run.endedAt, run.model]);
        }
        expect(issue.attempts.map((attempt) => attempt.index)).toEqual(issue.attempts.map((_, position) => position));
      }
      for (const pullRequest of project.pullRequests) {
        for (const round of pullRequest.reviewRounds) {
          expect(runNamed(round.runId).role).toBe('reviewer');
          expect(round.completedAt).toBe(runNamed(round.runId).endedAt);
        }
      }
      for (const request of project.requests) {
        if (request.challenge?.runId !== null && request.challenge !== null) expect(runNamed(request.challenge.runId).subject.id).toBe(request.id);
      }
      for (const audit of project.audits) {
        if (audit.conclusion !== null) expect(runNamed(audit.conclusion.runId).subject.id).toBe(audit.id);
      }
    }
  });

  it('link audits, releases and commits of the same project', () => {
    for (const project of snapshot.projects) {
      for (const audit of project.audits) {
        if (audit.releaseId !== null) {
          const release = required(project.releases.find((candidate) => candidate.id === audit.releaseId), `release of audit ${audit.id}`);
          expect(release.commits.some((commit) => commit.sha === audit.commitSha)).toBe(true);
        }
      }
      for (const release of project.releases) {
        for (const commit of release.commits) {
          if (commit.auditId !== null) expect(project.audits.some((audit) => audit.id === commit.auditId && audit.commitSha === commit.sha)).toBe(true);
          if (commit.attribution === 'automation') expect(project.skippedChanges.some((change) => change.commitSha === commit.sha && change.automation === commit.automation)).toBe(true);
          if (commit.attribution === 'audit') expect(project.audits.some((audit) => audit.commitSha === commit.sha)).toBe(true);
          if (commit.attribution === 'factory-merge') expect(project.pullRequests.some((pull) => pull.number === commit.pullRequestNumber && pull.issueNumber === commit.issueNumber)).toBe(true);
        }
      }
    }
  });

  it('count the live runs in the slots of the installation', () => {
    const live = snapshot.runs.filter((run) => run.status === 'running' || run.status === 'waiting').length;
    expect(snapshot.installation.runSlots).toEqual({ limit: 3, running: live, queued: 1 });
    expect(live).toBe(2);
    expect(snapshot.settings.resources.maxConcurrentRuns).toBe(snapshot.installation.runSlots.limit);
  });

  it('keep the cost of an issue above the cost of the runs it names', () => {
    for (const project of snapshot.projects) {
      for (const issue of project.issues) {
        const spent = snapshot.runs.filter((run) => run.project === project.id && run.subject.kind === 'issue' && run.subject.id === String(issue.number)).reduce((sum, run) => sum + run.costUsd, 0);
        expect(issue.costUsd).toBeCloseTo(spent, 3);
      }
    }
  });
});

describe('the activity of the installation', () => {
  it('lists the latest events, newest first, below the sequence of the snapshot', () => {
    const { activity } = snapshot;
    expect(activity.length).toBeGreaterThanOrEqual(ACTIVITY_MINIMUM);
    expect(activity.length).toBeLessThanOrEqual(ACTIVITY_MAXIMUM);
    activity.forEach((event) => expect(() => StreamEventSchema.parse(event)).not.toThrow());
    activity.slice(1).forEach((event, position) => {
      const newer = required(activity[position], 'newer event');
      expect(event.sequence).toBeLessThan(newer.sequence);
      expect(Date.parse(event.occurredAt)).toBeLessThanOrEqual(Date.parse(newer.occurredAt));
    });
    expect(Math.max(...activity.map((event) => event.sequence))).toBeLessThan(INITIAL_SEQUENCE);
    expect(NOW - Date.parse(required(activity.at(-1), 'oldest event').occurredAt)).toBeLessThanOrEqual(48 * HOUR_MS + 2 * HOUR_MS);
  });

  it('names projects that exist and subjects that exist in them', () => {
    const projectIds = new Set(snapshot.projects.map((project) => project.id));
    for (const event of snapshot.activity) {
      if (event.project !== null) expect(projectIds.has(event.project)).toBe(true);
      const [kind, ...rest] = event.subject.split('/');
      const id = rest.join('/');
      const project = snapshot.projects.find((candidate) => candidate.id === event.project);
      const exists =
        kind === 'run'
          ? snapshot.runs.some((run) => run.id === id)
          : kind === 'usage'
            ? snapshot.usage.accounts.some((account) => account.name === id)
            : kind === 'scheduler' || kind === 'settings'
              ? true
              : project !== undefined &&
                (kind === 'issue'
                  ? project.issues.some((issue) => String(issue.number) === id)
                  : kind === 'request'
                    ? project.requests.some((request) => request.id === id)
                    : kind === 'release'
                      ? project.releases.some((release) => release.id === id)
                      : kind === 'audit'
                        ? project.audits.some((audit) => audit.id === id)
                        : false);
      expect([event.sequence, event.subject, exists]).toEqual([event.sequence, event.subject, true]);
    }
    expect(snapshot.activity.some((event) => event.project === null)).toBe(true);
    expect(new Set(snapshot.activity.map((event) => event.project))).toEqual(new Set([STOREFRONT_ID, LEDGER_ID, null]));
  });
});

describe('the readings of the world', () => {
  const stale = snapshot.installation.staleAfterMs;
  const ageOf = (readAt: string | null): number | null => (readAt === null ? null : NOW - Date.parse(readAt));
  const forge = [
    ...snapshot.projects.flatMap((project) => project.pullRequests.map((pull) => pull.checks.readAt)),
    ...snapshot.projects.flatMap((project) => (project.workflows === null ? [] : [project.workflows.readAt])),
    ...snapshot.projects.flatMap((project) => project.environments.flatMap((environment) => (environment.deployments === null ? [] : [environment.deployments.readAt]))),
  ];
  const health = snapshot.projects.flatMap((project) => project.environments.flatMap((environment) => environment.health.map((check) => check.latest?.at ?? null)));
  const tools = [...snapshot.tools.map((tool) => tool.checkedAt), ...snapshot.projects.flatMap((project) => project.tools.map((tool) => tool.checkedAt))];
  const knowledge = snapshot.projects.flatMap((project) => project.knowledge.map((source) => source.documents.readAt));

  it.each([
    ['forge', forge, stale.forge],
    ['health', health, stale.health],
    ['tools', tools, stale.tools],
    ['knowledge', knowledge, stale.knowledge],
  ] as const)('mostly fresh and a few stale for the %s', (_kind, readAts, threshold) => {
    const ages = readAts.map(ageOf).filter((age): age is number => age !== null);
    const staleCount = ages.filter((age) => age > threshold).length;
    expect(staleCount).toBeGreaterThanOrEqual(1);
    expect(ages.length - staleCount).toBeGreaterThan(staleCount);
  });

  it('keep the sample of the machine fresh and the usage within twenty minutes', () => {
    const sample = snapshot.resources.sample;
    expect(NOW - Date.parse(required(sample.readAt, 'sample time'))).toBeLessThan(stale.resources);
    expect(NOW - Date.parse(required(snapshot.usage.accounts[0]?.readAt, 'usage reading'))).toBeLessThanOrEqual(20 * MINUTE_MS);
  });

  it('use the thresholds the installation announces', () => {
    expect(stale).toEqual({ forge: 900_000, health: 600_000, resources: 120_000, tools: 43_200_000, knowledge: 900_000 });
  });
});

describe('the addresses of the world', () => {
  it('point the storefront at its forge and the ledger at the files its forge serves', () => {
    for (const issue of storefront.issues) expect(issue.url).toBe(`https://github.example.com/example-org/storefront/issues/${issue.number}`);
    for (const pull of storefront.pullRequests) expect(pull.url).toBe(`https://github.example.com/example-org/storefront/pull/${pull.number}`);
    for (const issue of ledger.issues) expect(issue.url).toBe(`/api/projects/ledger/forge/issues/${issue.number}.md`);
    for (const pull of ledger.pullRequests) expect(pull.url).toBe(`/api/projects/ledger/forge/pulls/${pull.number}.md`);
    expect(storefront.forge).toEqual({ kind: 'github', url: 'https://github.example.com/example-org/storefront' });
    expect(ledger.forge).toEqual({ kind: 'local', url: null });
  });

  it('only use hosts that cannot belong to anyone', () => {
    const text = JSON.stringify(snapshot) + [...world.logs.values()].map((lines) => JSON.stringify(lines)).join('');
    const hosts = new Set([...text.matchAll(/https?:\/\/([^/\s"'\\:]+)/g)].map((match) => (match[1] ?? '').toLowerCase()));
    for (const host of hosts) expect(/(^|\.)example\.(com|org)$|\.invalid$/.test(host)).toBe(true);
    expect(hosts.size).toBeGreaterThan(5);
  });
});

describe('the fields a forge may leave unknown', () => {
  it('list no files for an audit of a change whose files were not read yet, and suggest no type for it', () => {
    const unread = snapshot.projects.flatMap((project) => project.audits).filter((audit) => audit.changedFiles === null);
    expect(unread.length).toBeGreaterThanOrEqual(2);
    expect(unread.every((audit) => audit.state === 'detected' && audit.suggestedType === null)).toBe(true);
    expect(unread.some((audit) => audit.reason === 'on-demand')).toBe(true);
    const read = snapshot.projects.flatMap((project) => project.audits).filter((audit) => audit.changedFiles !== null);
    expect(read.some((audit) => audit.suggestedType !== null)).toBe(true);
  });

  it('attribute a scheduled workflow run to no one', () => {
    const runs = required(storefront.workflows?.value, 'workflow runs');
    expect(runs.some((run) => run.actor === null && run.trigger === 'schedule')).toBe(true);
    expect(runs.some((run) => run.actor !== null)).toBe(true);
  });
});

describe('the helpers that change a snapshot', () => {
  it('replace one project and the runs without touching the rest', () => {
    const renamed = mapProject(snapshot, LEDGER_ID, (project) => ({ ...project, name: 'Ledger billing' }));
    expect(renamed.projects.map((project) => project.name)).toEqual(['Storefront', 'Ledger billing']);
    expect(renamed.projects[0]).toBe(snapshot.projects[0]);
    expect(snapshot.projects[1]?.name).toBe('Ledger');
    expect(() => mapProject(snapshot, 'unknown', (project) => project)).toThrow('the snapshot has no project unknown');
    const fewer = mapRuns(snapshot, (runs) => runs.filter((run) => run.status === 'running'));
    expect(fewer.runs).toHaveLength(1);
    expect(fewer.projects).toBe(snapshot.projects);
    expect(snapshot.runs.length).toBeGreaterThan(1);
  });
});
