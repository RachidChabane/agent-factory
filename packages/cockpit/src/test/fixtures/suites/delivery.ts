import {
  attributeCommit,
  AUDIT_REASONS,
  AUDIT_STATES,
  evaluateReleaseGate,
  RELEASE_STATES,
  type AttributionRules,
} from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_FINDING_LEVELS,
  COMMIT_ATTRIBUTIONS,
  DEPLOYMENT_OUTCOMES,
  ENVIRONMENT_STATUSES,
  type EnvironmentView,
  type ProjectView,
} from '../../../contract/index.ts';
import { DAY_MS } from '../time.ts';
import { ledger, NOW, required, snapshot, storefront } from './world-under-test.ts';

const environments = snapshot.projects.flatMap((project) => project.environments);
const releases = snapshot.projects.flatMap((project) => project.releases);
const audits = snapshot.projects.flatMap((project) => project.audits);
const FACTORY_LABEL = 'factory';

function setOf<Value>(values: readonly Value[]): Set<Value> {
  return new Set(values);
}

function environmentNamed(project: ProjectView, name: string): EnvironmentView {
  return required(
    project.environments.find((environment) => environment.name === name),
    `environment ${name}`,
  );
}

function rulesOf(project: ProjectView): AttributionRules {
  return { branchPrefix: project.settings.branchPrefix, factoryLabel: FACTORY_LABEL, automations: project.settings.automations };
}

describe('the environments of the world', () => {
  it('cover every status of an environment', () => {
    expect(setOf(environments.map((environment) => environment.status))).toEqual(setOf(ENVIRONMENT_STATUSES));
  });

  it('call production the one environment that is production', () => {
    for (const project of snapshot.projects) {
      for (const environment of project.environments) expect([environment.name, environment.production]).toEqual([environment.name, environment.name === 'production']);
    }
  });

  it('deploy development after every merge with a history of every outcome', () => {
    const development = environmentNamed(storefront, 'development');
    const deployments = required(development.deployments?.value, 'deployments');
    expect([development.promotion, development.redeployable, development.status]).toEqual(['automatic', true, 'deploying']);
    expect(development.deployments?.error).toBeNull();
    expect(deployments.history.length).toBeGreaterThanOrEqual(5);
    expect(setOf(deployments.history.map((entry) => entry.outcome))).toEqual(setOf(DEPLOYMENT_OUTCOMES));
    expect(deployments.current?.outcome).toBe('success');
    expect(deployments.history.some((entry) => entry.id === deployments.current?.id)).toBe(true);
    expect(deployments.history[0]?.outcome).toBe('in-progress');
  });

  it('sample the health of development every hour of the last day', () => {
    const check = required(environmentNamed(storefront, 'development').health[0], 'health check');
    expect(check.series).toHaveLength(24);
    const times = check.series.map((sample) => Date.parse(sample.at));
    expect(times).toEqual([...times].sort((left, right) => left - right));
    expect(check.series.some((sample) => !sample.ok)).toBe(true);
    expect(check.series.filter((sample) => sample.ok).every((sample) => sample.latencyMs !== null && sample.statusCode === 200 && sample.detail.length > 0)).toBe(true);
    expect(check.series.filter((sample) => !sample.ok).every((sample) => sample.statusCode === 503 && sample.latencyMs !== null && sample.detail.length > 0)).toBe(true);
    expect(check.latest).toEqual(check.series.at(-1));
  });

  it('keep the last deployments of staging when the forge cannot be read, and check two pages of it', () => {
    const staging = environmentNamed(storefront, 'staging');
    expect([staging.promotion, staging.redeployable]).toEqual(['batch', true]);
    expect(staging.deployments?.error).not.toBeNull();
    expect(staging.deployments?.value?.current).not.toBeNull();
    expect(staging.deployments?.readAt).not.toBeNull();
    expect(staging.health).toHaveLength(2);
    expect(setOf(staging.health.map((check) => check.series.length))).toEqual(setOf([0, 24]));
    const unsampled = required(staging.health.find((check) => check.series.length === 0), 'unsampled check');
    expect(unsampled.latest).toBeNull();
  });

  it('never let the factory deploy production', () => {
    const production = environmentNamed(storefront, 'production');
    expect([production.production, production.promotion, production.redeployable, production.status]).toEqual([true, 'manual', false, 'healthy']);
    expect(production.workflowUrl).not.toBeNull();
    expect(production.deployments?.value?.current).not.toBeNull();
    expect(production.deployments?.value?.history.every((entry) => entry.workflowUrl !== null)).toBe(true);
  });

  it('give every storefront environment the commits of its deployments, the empty and the unknown ones included, and those waiting behind the current one', () => {
    for (const name of ['development', 'staging', 'production']) {
      const read = required(environmentNamed(storefront, name).deployments?.value, `deployments of ${name}`);
      const changes = read.history.map((entry) => entry.changes);
      expect(changes.some((entry) => entry !== null && entry.length > 0), `${name} has a deployment with commits`).toBe(true);
      expect(changes.some((entry) => entry === null), `${name} has a deployment whose commits are unknown`).toBe(true);
      expect(read.pending, `${name} has commits waiting`).not.toBeNull();
    }
    const staging = required(environmentNamed(storefront, 'staging').deployments?.value, 'deployments of staging');
    expect(staging.history.some((entry) => entry.changes?.length === 0)).toBe(true);
    expect(staging.history.flatMap((entry) => entry.changes ?? []).some((commit) => commit.pullRequestNumber !== null && commit.issueNumber !== null)).toBe(true);
    expect(staging.history.flatMap((entry) => entry.changes ?? []).some((commit) => commit.pullRequestNumber !== null && commit.issueNumber === null)).toBe(true);
  });

  it('give the ledger an environment with no deployment source and one where nothing was deployed yet', () => {
    const staging = environmentNamed(ledger, 'staging');
    expect([staging.deployments, staging.status, staging.health]).toEqual([null, 'unknown', []]);
    const production = environmentNamed(ledger, 'production');
    expect(production.deployments?.value).toEqual({ current: null, history: [], pending: null });
    expect(production.deployments?.error).toBeNull();
    expect(production.status).toBe('down');
    expect(production.health[0]?.series.every((sample) => !sample.ok && sample.statusCode === null)).toBe(true);
  });
});

describe('the releases of the world', () => {
  it('cover every state of a release', () => {
    expect(setOf(releases.map((release) => release.state))).toEqual(setOf(RELEASE_STATES));
    expect(setOf(storefront.releases.map((release) => release.state))).toEqual(setOf(['open', 'auditing', 'blocked', 'promotable', 'promoted', 'verified']));
    expect(ledger.releases.map((release) => release.state).sort()).toEqual(['auditing', 'cut']);
  });

  it('keep the release pull request of the next version open, three days after the forge created it', () => {
    const next = required(
      storefront.releases.find((release) => release.source === 'pull-request' && release.supersededBy === null),
      'open release pull request',
    );
    expect(next.state).toBe('open');
    expect(next.ref).toBe('main');
    expect(Date.parse(required(next.createdAt, 'creation time')) + 3 * DAY_MS).toBe(Date.parse(next.detectedAt));
    expect(next.pullRequestNumber).not.toBeNull();
  });

  it('show an old release pull request whose version is already published', () => {
    const superseded = required(
      storefront.releases.find((release) => release.supersededBy !== null),
      'superseded release',
    );
    expect(superseded.supersededBy).toBe('1.8.0');
    expect(superseded.state).toBe('open');
    expect(superseded.gate.evaluatedAt).toBeNull();
    expect(storefront.releases.some((release) => release.id === superseded.supersededBy && release.source === 'tag')).toBe(true);
  });

  it('read a tag with no creation time as a tag whose commit date is unknown', () => {
    const tags = releases.filter((release) => release.source === 'tag');
    expect(tags.some((release) => release.createdAt === null)).toBe(true);
    expect(tags.every((release) => release.pullRequestNumber === null && release.ref === release.id)).toBe(true);
    expect(ledger.releases.every((release) => release.source === 'tag')).toBe(true);
    expect(ledger.settings.releaseModel).toBe('tags');
    expect(storefront.settings.releaseModel).toBe('release-please');
  });

  it('block a release for the three reasons its gate gives', () => {
    const blocked = required(
      storefront.releases.find((release) => release.state === 'blocked'),
      'blocked release',
    );
    expect(blocked.gate.promotable).toBe(false);
    expect(blocked.gate.blockingReasons).toHaveLength(3);
    expect(blocked.gate.blockingReasons[0]).toMatch(/^audit auditing is open on commit [0-9a-f]{40}$/);
    const merged = required(storefront.pullRequests.find((pull) => !pull.evidenceComplete && pull.state === 'merged'), 'merged pull request');
    expect(blocked.gate.blockingReasons[1]).toBe(`pull request #${merged.number} has incomplete evidence`);
    expect(blocked.gate.blockingReasons[2]).toBe('health check homepage of staging failed');
    expect(blocked.health.some((check) => !check.passed)).toBe(true);
    expect(blocked.report).toContain('Not promotable.');
  });

  it('agree with their own gate', () => {
    for (const release of releases) {
      if (release.gate.evaluatedAt === null) {
        expect(release.gate).toEqual({ promotable: false, blockingReasons: [], evaluatedAt: null });
        continue;
      }
      const project = required(snapshot.projects.find((candidate) => candidate.releases.includes(release)), 'project of release');
      const shas = release.commits.map((commit) => commit.sha);
      const verdict = evaluateReleaseGate({
        commitShas: shas,
        audits: project.audits.filter((audit) => shas.includes(audit.commitSha)).map((audit) => ({ commitSha: audit.commitSha, state: audit.state, resolved: audit.resolved })),
        mergedPullRequests: release.commits.flatMap((commit) => (commit.attribution === 'factory-merge' && commit.pullRequestNumber !== null && commit.evidenceComplete !== null ? [{ number: commit.pullRequestNumber, evidenceComplete: commit.evidenceComplete }] : [])),
        healthRequired: project.id === storefront.id,
        healthChecks: release.health,
      });
      expect(release.gate.blockingReasons).toEqual(verdict.blockingReasons);
      expect(release.gate.promotable).toBe(verdict.promotable);
      if (['promotable', 'promoted', 'verified'].includes(release.state)) expect(release.gate.promotable).toBe(true);
      if (release.state === 'blocked') expect(release.gate.promotable).toBe(false);
      expect(release.report.startsWith(`# Release audit report: ${release.id}`)).toBe(true);
    }
  });

  it('time their steps in order', () => {
    for (const release of releases) {
      expect(release.promotedAt !== null).toBe(['promoted', 'verified'].includes(release.state));
      expect(release.verifiedAt !== null).toBe(release.state === 'verified');
      expect(release.cutAt === null).toBe(release.state === 'open');
      const times = [release.createdAt, release.detectedAt, release.cutAt, release.promotedAt, release.verifiedAt].flatMap((time) => (time === null ? [] : [Date.parse(time)]));
      expect(times).toEqual([...times].sort((left, right) => left - right));
    }
  });

  it('list the commits of every origin, each with what its origin requires', () => {
    const commits = releases.flatMap((release) => release.commits);
    expect(setOf(commits.map((commit) => commit.attribution))).toEqual(setOf(COMMIT_ATTRIBUTIONS));
    for (const commit of commits) {
      expect(commit.automation !== null).toBe(commit.attribution === 'automation');
      if (commit.attribution === 'audit') expect(commit.auditId).not.toBeNull();
      if (commit.attribution === 'factory-merge') expect([commit.issueNumber === null, commit.evidenceComplete === null]).toEqual([false, false]);
      else expect(commit.evidenceComplete).toBeNull();
    }
    expect(commits.some((commit) => commit.attribution === 'factory-merge' && commit.auditId !== null)).toBe(true);
    expect(commits.some((commit) => commit.evidenceComplete === false)).toBe(true);
    expect(releases.flatMap((release) => release.health).map((check) => check.passed)).toContain(false);
    expect(releases.flatMap((release) => release.health).map((check) => check.passed)).toContain(true);
  });
});

describe('the audits of the world', () => {
  it('cover every state and every reason of an audit', () => {
    expect(setOf(audits.map((audit) => audit.state))).toEqual(setOf(AUDIT_STATES));
    expect(setOf(audits.map((audit) => audit.reason))).toEqual(setOf(AUDIT_REASONS));
  });

  it('conclude with findings at the three levels, a fix, a draft and an issue that was published', () => {
    const concluded = audits.flatMap((audit) => (audit.conclusion === null ? [] : [audit]));
    const findings = concluded.flatMap((audit) => audit.conclusion?.findings ?? []);
    expect(setOf(findings.map((finding) => finding.level))).toEqual(setOf(AUDIT_FINDING_LEVELS));
    expect(concluded.some((audit) => audit.conclusion?.proposedFix !== null)).toBe(true);
    expect(audits.some((audit) => audit.draft !== null && audit.publishedIssueNumber === null)).toBe(true);
    const published = required(
      audits.find((audit) => audit.publishedIssueNumber !== null),
      'published audit',
    );
    expect(storefront.issues.find((issue) => issue.number === published.publishedIssueNumber)?.title).toBe(published.draft?.title);
  });

  it('resolve some audits and leave others to the operator', () => {
    const resolved = audits.filter((audit) => audit.resolved);
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved.every((audit) => audit.resolutionNote !== null && ['challenge', 'rewrite'].includes(audit.state))).toBe(true);
    const open = audits.filter((audit) => ['challenge', 'rewrite'].includes(audit.state) && !audit.resolved);
    expect(open.length).toBeGreaterThan(0);
    expect(audits.filter((audit) => !audit.resolved).every((audit) => audit.resolutionNote === null)).toBe(true);
  });

  it('record a failure that the audit keeps and a link to the release that contains it', () => {
    const failing = required(
      audits.find((audit) => audit.failureCount > 0),
      'failing audit',
    );
    expect(failing.lastFailure).not.toBeNull();
    expect(audits.filter((audit) => audit.failureCount === 0).every((audit) => audit.lastFailure === null)).toBe(true);
    expect(audits.some((audit) => audit.releaseId !== null)).toBe(true);
  });

  it('suggest only the types a project declares', () => {
    for (const project of snapshot.projects) {
      for (const audit of project.audits) if (audit.suggestedType !== null) expect(project.issueTypes.map((type) => type.id)).toContain(audit.suggestedType);
    }
  });

  it('were detected for the reason the rules of their project give', () => {
    for (const project of snapshot.projects) {
      for (const audit of project.audits) {
        if (audit.reason === 'on-demand') continue;
        const attribution = attributeCommit(
          { authorLogin: audit.authorLogin, pullRequestNumber: audit.pullRequestNumber, pullRequestBranch: audit.branch, pullRequestLabels: [] },
          rulesOf(project),
        );
        expect(attribution).toEqual({ kind: 'audit', reason: audit.reason });
      }
    }
  });

  it('record the changes of other automations without auditing them', () => {
    const skipped = storefront.skippedChanges;
    expect(skipped.length).toBeGreaterThanOrEqual(3);
    expect(setOf(skipped.map((change) => change.automation)).size).toBeGreaterThanOrEqual(2);
    expect(skipped.some((change) => change.authorLogin === null)).toBe(true);
    expect(ledger.skippedChanges).toEqual([]);
    for (const change of skipped) {
      const attribution = attributeCommit(
        { authorLogin: change.authorLogin, pullRequestNumber: change.pullRequestNumber, pullRequestBranch: change.branch, pullRequestLabels: [] },
        rulesOf(storefront),
      );
      expect(attribution).toEqual({ kind: 'automation', automation: change.automation });
    }
  });

  it('detect every change in the past', () => {
    for (const audit of audits) {
      expect(NOW - Date.parse(audit.detectedAt)).toBeGreaterThan(0);
      expect(NOW - Date.parse(audit.detectedAt)).toBeLessThan(40 * DAY_MS);
    }
  });
});
