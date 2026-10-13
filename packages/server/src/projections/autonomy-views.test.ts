import { describe, expect, it } from 'vitest';
import { AutonomyViewSchema, DelegatedDecisionViewSchema, ProjectViewSchema } from '@agent-factory/cockpit';
import { GESTURE_MADE_EVENT, type FactoryEventRecord } from '@agent-factory/application';
import { NO_AUTONOMY, type AutonomyPolicy } from '@agent-factory/domain';
import { autonomyView, DELEGATED_DECISIONS_LIMIT, delegatedDecisionViews, pullRequestDecisions } from './autonomy-views.ts';
import { projectView, type ProjectReadingsView } from './project-view.ts';
import { PROJECT, projectContext, projectHistory, type ProjectHistory } from './testing/project-history.ts';

const AT = Date.parse('2026-10-09T11:00:00.000Z');
const READINGS: ProjectReadingsView = { forgeUrl: null, workflows: null, deployments: () => null, knowledge: [], references: [], tools: [], installationToolChecks: new Map() };

function gesture(sequence: number, overrides: Record<string, unknown> = {}, subject = 'issue/42'): FactoryEventRecord {
  return {
    sequence,
    occurredAt: new Date(AT + sequence * 1_000),
    type: GESTURE_MADE_EVENT,
    subject,
    payload: { actor: 'orchestrator', gesture: 'validate-spec', target: { kind: 'issue', number: 42 }, issueNumber: 42, reason: 'the spec follows the template', rule: 'autonomy.validateSpecs', ...overrides },
  };
}

const MERGE = { gesture: 'merge', target: { kind: 'pull-request', number: 100 }, reason: 'documentation only', rule: 'autonomy.merge for docs' };

describe('the decisions the delegate made', () => {
  it('are listed newest first, as the cockpit contract wants them', () => {
    const views = delegatedDecisionViews([gesture(1), gesture(2, MERGE)]);
    expect(views.map((view) => [view.gesture, view.target.kind, view.reason])).toEqual([
      ['merge', 'pull-request', 'documentation only'],
      ['validate-spec', 'issue', 'the spec follows the template'],
    ]);
    for (const view of views) expect(DelegatedDecisionViewSchema.safeParse(view).error?.issues ?? []).toEqual([]);
    expect(views[0]?.at).toBe(new Date(AT + 2_000).toISOString());
  });

  it('are bounded, the oldest left out', () => {
    const many = Array.from({ length: DELEGATED_DECISIONS_LIMIT + 7 }, (_, index) => gesture(index + 1, { reason: `decision ${index + 1}` }));
    const views = delegatedDecisionViews(many);
    expect(views).toHaveLength(DELEGATED_DECISIONS_LIMIT);
    expect(views[0]?.reason).toBe(`decision ${DELEGATED_DECISIONS_LIMIT + 7}`);
    expect(delegatedDecisionViews(many, 3)).toHaveLength(3);
  });

  it('leave out a record that does not parse, and the events that are no decision', () => {
    const noise: FactoryEventRecord = { sequence: 9, occurredAt: new Date(AT), type: 'issue.transitioned', subject: 'issue/42', payload: { to: 'pr-open' } };
    expect(delegatedDecisionViews([noise, gesture(10, { reason: '' }), gesture(11)])).toHaveLength(1);
  });

  it('are told apart by the pull request they target', () => {
    const views = delegatedDecisionViews([gesture(1), gesture(2, MERGE), gesture(3, { ...MERGE, target: { kind: 'pull-request', number: 101 } })]);
    expect(pullRequestDecisions(views, 100).map((view) => view.gesture)).toEqual(['merge']);
    expect(pullRequestDecisions(views, 7)).toEqual([]);
  });
});

describe('the policy of a project in the cockpit', () => {
  it('says what is delegated, rule by rule', () => {
    const policy: AutonomyPolicy = { actor: 'release-bot', validateSpecs: true, answerDecisions: false, resume: true, merge: [{ types: ['docs', 'fix'], requires: ['films-recorded'] }] };
    const view = autonomyView(policy);
    expect(view).toEqual(policy);
    expect(AutonomyViewSchema.safeParse(view).error?.issues ?? []).toEqual([]);
    expect(autonomyView(NO_AUTONOMY)).toEqual({ actor: 'orchestrator', validateSpecs: false, answerDecisions: false, resume: false, merge: [] });
  });
});

describe('the view of a project that has a delegate', () => {
  function withGestures(history: ProjectHistory): ProjectHistory {
    const last = Math.max(...[...history.project, ...history.installation].map((record) => record.sequence));
    return { ...history, project: [...history.project, gesture(last + 1), gesture(last + 2, MERGE)] };
  }

  const { view } = projectView(PROJECT, withGestures(projectHistory()).project, projectContext(withGestures(projectHistory())), READINGS);

  it('lists the decisions of the project, and marks the issue and the pull request they belong to', () => {
    expect(ProjectViewSchema.safeParse(view).error?.issues ?? []).toEqual([]);
    expect(view.delegatedDecisions.map((decision) => decision.gesture)).toEqual(['merge', 'validate-spec']);
    expect(view.issues.find((issue) => issue.number === 42)?.delegated.map((decision) => decision.gesture)).toEqual(['merge', 'validate-spec']);
    expect(view.issues.find((issue) => issue.number === 44)?.delegated).toEqual([]);
    expect(view.pullRequests.find((pullRequest) => pullRequest.number === 100)?.delegated.map((decision) => decision.gesture)).toEqual(['merge']);
  });

  it('states the policy among the settings of the project', () => {
    expect(view.settings.autonomy).toEqual(autonomyView(PROJECT.autonomy));
  });
});
