import { ACCEPTANCE_MANIFEST_PATH, DECISION_REQUEST_PATH } from '@agent-factory/application';
import type { ProjectStory, StoryAttempt, StoryChecks, StoryIssue, StoryOutsideChange, StoryProposedIssue, StoryRequest, StoryWork } from './story-types.ts';

/** The scenario file the fake Claude CLI plays, as its README describes it. */
export type ScenarioStep = { readonly say: string } | { readonly write: { readonly path: string; readonly content: string } } | { readonly delete: string };

export interface ScenarioAttempt {
  readonly steps: readonly ScenarioStep[];
  readonly final: string;
}

export interface ScenarioEntry {
  readonly role: 'acceptance-author' | 'implementer' | 'reviewer' | 'auditor' | 'challenger';
  readonly when: string;
  readonly attempts: readonly ScenarioAttempt[];
}

export interface Scenario {
  readonly usage: {
    readonly session: { readonly percent: number; readonly resetsInHours: number };
    readonly weeklyAll: { readonly percent: number; readonly resetsInHours: number };
    readonly weeklyScoped: readonly { readonly model: string; readonly percent: number; readonly resetsInHours: number }[];
  };
  readonly entries: readonly ScenarioEntry[];
  readonly fallback: Partial<Record<ScenarioEntry['role'], { readonly attempts: readonly ScenarioAttempt[] }>>;
}

const JSON_INDENT = 2;
const NODE_TEST_RUNNER = 'node-test';
/** The subscription usage the accounts report: a working week well under the pause thresholds. */
const USAGE: Scenario['usage'] = {
  session: { percent: 23, resetsInHours: 3 },
  weeklyAll: { percent: 41, resetsInHours: 76 },
  weeklyScoped: [{ model: 'Opus', percent: 18, resetsInHours: 76 }],
};

function jsonBlock(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, JSON_INDENT)}\n\`\`\``;
}

function says(texts: readonly string[]): ScenarioStep[] {
  return texts.map((say) => ({ say }));
}

function checksAttempt(checks: StoryChecks): ScenarioAttempt {
  const manifest = { runner: NODE_TEST_RUNNER, checks: checks.checks, command: checks.command, evidence: checks.evidence };
  return {
    steps: [
      ...says(checks.says),
      ...checks.files.map((file) => ({ write: { path: file.path, content: file.content } })),
      { write: { path: ACCEPTANCE_MANIFEST_PATH, content: `${JSON.stringify(manifest, null, JSON_INDENT)}\n` } },
    ],
    final: checks.final,
  };
}

function implementerAttempt(attempt: StoryAttempt): ScenarioAttempt {
  return {
    steps: [...says(attempt.says), ...attempt.writes.map((file) => ({ write: { path: file.path, content: file.content } })), ...attempt.deletes.map((path) => ({ delete: path }))],
    final: attempt.final,
  };
}

function decisionAttempt(question: string): ScenarioAttempt {
  return { steps: [{ write: { path: DECISION_REQUEST_PATH, content: `${question}\n` } }], final: question };
}

/** The scripted agents of one piece of work, selected by the title of its spec. */
export function workEntries(title: string, work: StoryWork): readonly ScenarioEntry[] {
  return [
    { role: 'acceptance-author', when: title, attempts: [checksAttempt(work.checks)] },
    {
      role: 'implementer',
      when: title,
      attempts: [...(work.decision === null ? [] : [decisionAttempt(work.decision)]), ...work.attempts.map(implementerAttempt)],
    },
    { role: 'reviewer', when: title, attempts: [{ steps: [], final: `${work.review.says}\n\n${jsonBlock({ findings: work.review.findings })}` }] },
  ];
}

function issueEntries(issue: StoryIssue): readonly ScenarioEntry[] {
  return workEntries(issue.spec.title, issue);
}

function proposedIssueEntries(proposed: StoryProposedIssue): readonly ScenarioEntry[] {
  return workEntries(proposed.title, proposed);
}

function requestEntry(request: StoryRequest): readonly ScenarioEntry[] {
  if (request.challenge === null) return [];
  return [{ role: 'challenger', when: request.title, attempts: [{ steps: [], final: `${request.challenge.summary}\n\n${jsonBlock(request.challenge)}` }] }];
}

function auditEntry(change: StoryOutsideChange): readonly ScenarioEntry[] {
  if (change.verdict === null) return [];
  return [{ role: 'auditor', when: change.message, attempts: [{ steps: [], final: `${change.verdict.summary}\n\n${jsonBlock(change.verdict)}` }] }];
}

/** What an agent does with work no part of the story describes: it says what it would need, and changes nothing. */
const FALLBACK: Scenario['fallback'] = {
  challenger: {
    attempts: [
      {
        steps: [],
        final: `I need the requester's goal before I can split this into work.\n\n${jsonBlock({
          summary: 'The request needs a clearer goal before it can become work.',
          items: [
            {
              title: 'Clarify the goal of the request',
              verdict: 'ask',
              currentState: 'The request describes a wish without the problem it solves.',
              intent: 'Unknown until the requester answers.',
              idea: 'None proposed yet.',
              method: 'None proposed yet.',
              reason: 'Without the problem, any change risks solving the wrong one.',
              question: 'What does a customer fail to do today, and how often?',
              sources: [],
            },
          ],
          specs: [],
          reply: 'Thanks for the request. Before we plan it, could you tell us what customers fail to do today and how often it happens?',
        })}`,
      },
    ],
  },
};

/** The scenario of every agent the story's projects call on. */
export function storyScenario(stories: readonly ProjectStory[]): Scenario {
  return {
    usage: USAGE,
    entries: stories.flatMap((story) => [
      ...story.issues.flatMap(issueEntries),
      ...story.proposedIssues.flatMap(proposedIssueEntries),
      ...story.requests.flatMap(requestEntry),
      ...story.outsideChanges.flatMap(auditEntry),
    ]),
    fallback: FALLBACK,
  };
}
