import { join } from 'node:path';
import {
  ACCEPTANCE_MANIFEST_PATH,
  attributionRules,
  AuditVerdictSchema,
  ChallengeAnswerSchema,
  checkPaths,
  checksValue,
  GATE_STEP_NAMES,
  isSafeRelativePath,
  planIssueCreation,
  readAcceptanceManifest,
  renderChangeDescription,
  renderSpecFile,
  requestTitleOf,
  singleLine,
  specValue,
  type AcceptanceManifest,
  type ChallengeAnswer,
  type PipelineSettings,
} from '@agent-factory/application';
import {
  attributeCommit,
  compareVersions,
  matchesAnyGlob,
  NAMED_CRITERION_PATTERN,
  releaseVersionOf,
  REVIEW_CATEGORIES,
  REVIEW_SEVERITIES,
  type IssueSpec,
} from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import { projectOf } from '../../config/agent-factory-config.ts';
import { imageSize } from '../../snapshot/image-size.ts';
import { EXAMPLES_DIRECTORY } from '../demo-paths.ts';
import { DEMO_PROJECTS } from '../demo-projects.ts';
import type { DemoProject } from '../demo-world.ts';
import { LEDGER_STORY } from './ledger-story.ts';
import { WEBHOOK_SIGNATURES } from './ledger/webhook-signatures.ts';
import { storyScenario, type ScenarioEntry } from './scenario.ts';
import { CART_BADGE_TOTAL } from './storefront/cart-badge-total.ts';
import { STOREFRONT_STORY } from './storefront-story.ts';
import { REQUESTER_DANA, REQUESTER_JORDAN, REQUESTER_RILEY, REQUESTER_SAM } from './story-people.ts';
import type { ProjectStory, StoryAttempt, StoryFile, StoryIssue, StoryRequest, StoryWork } from './story-types.ts';
import { pipelineSettingsOf, resolvedConfiguration } from './testing/demo-configuration.ts';
import { proveOnBase, runGate, type GateOutcome } from './testing/story-gate.ts';
import { CODE_FENCE, collectStrings, filesUnder, MENTIONS_OF_THE_DEMONSTRATION, unresolvedReferences } from './testing/story-prose.ts';
import { applyAttempt, baseKindsOf, changesBefore, dependenciesOf, inWorkspace, issueOfProposed, prepareBase, prepareEverything } from './testing/story-replay.ts';
import { StoryWorkspace } from './testing/story-workspace.ts';

const FIRST_POSITION = 1;
const TEAM: readonly string[] = [REQUESTER_DANA, REQUESTER_RILEY, REQUESTER_SAM, REQUESTER_JORDAN];
const ASSERTION_FAILURE = /ERR_ASSERTION|AssertionError/;
const OTHER_FAILURE = /ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError/;
const RESERVED_PATH_PREFIXES: readonly string[] = ['.factory/', '.evidence/', '.git/'];
const ALLOWED_HOST = /^(?:example\.(?:com|org)|(?:[\w-]+\.)+example\.(?:com|org)|(?:[\w-]+\.)*[\w-]+\.invalid|127\.0\.0\.1|localhost)$/;
const URL_HOST = /https?:\/\/([^/\s:'"`)]+)/g;
const EMAIL_HOST = /[\w.+[\]-]+@([\w.-]+)/g;
const HOST_GROUP = 1;
/** A standalone SVG file declares its format with this URL, which names a namespace and which nothing fetches. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const CRITERION_GROUP = 1;
const FAILURE_OUTPUT_LINES = 40;
const NEWLINE = '\n';
const GITIGNORE = '.gitignore';
const COMMIT_SHA_LENGTH = 40;
const KEPT_VERDICTS: readonly string[] = ['keep', 'adjust', 'split'];

const CONFIGURATION = resolvedConfiguration();
const STORIES: readonly ProjectStory[] = [STOREFRONT_STORY, LEDGER_STORY];
const SCENARIO = storyScenario(STORIES);

interface ProjectContext {
  readonly story: ProjectStory;
  readonly demo: DemoProject;
  readonly settings: PipelineSettings;
}

interface NumberedIssue {
  readonly issue: StoryIssue;
  readonly number: number;
}

type GateStage = 'before-acceptance' | 'acceptance' | 'after-acceptance';

interface ExpectedRefusal {
  readonly stage: GateStage;
  readonly failingCriteria: readonly number[];
}

/** Why the gate refuses the attempts that are not the last: the stage of the gate that fails and the criteria the acceptance checks report. */
const EXPECTED_REFUSALS: Readonly<Record<string, readonly ExpectedRefusal[]>> = {
  [CART_BADGE_TOTAL.key]: [{ stage: 'after-acceptance', failingCriteria: [] }],
  [WEBHOOK_SIGNATURES.key]: [{ stage: 'acceptance', failingCriteria: [2, 3, 4] }],
};

function contextOf(story: ProjectStory): ProjectContext {
  const demo = DEMO_PROJECTS.find((project) => project.id === story.project);
  if (demo === undefined) throw new Error(`no project ${story.project} in the demonstration`);
  return { story, demo, settings: pipelineSettingsOf(CONFIGURATION, story.project) };
}

const CONTEXTS: readonly ProjectContext[] = STORIES.map(contextOf);

function numbered(issues: readonly StoryIssue[]): readonly NumberedIssue[] {
  return issues.map((issue, index) => ({ issue, number: index + FIRST_POSITION }));
}

function specOf({ issue, number }: NumberedIssue): IssueSpec {
  return {
    number,
    ...issue.spec,
    acceptanceCriteria: [...issue.spec.acceptanceCriteria],
    outOfScope: [...issue.spec.outOfScope],
    dependsOn: [],
    commitKind: null,
    films: [],
  };
}

function criteriaOf(entry: NumberedIssue): readonly number[] {
  return entry.issue.spec.acceptanceCriteria.map((_, index) => index + FIRST_POSITION);
}

function acceptanceAuthorEntry(issue: StoryIssue): ScenarioEntry {
  const entry = SCENARIO.entries.find((candidate) => candidate.role === 'acceptance-author' && candidate.when === issue.spec.title);
  if (entry === undefined) throw new Error(`no acceptance author is scripted for ${issue.key}`);
  return entry;
}

/** The manifest as the scripted acceptance author writes it. */
function manifestTextOf(issue: StoryIssue): string | null {
  const steps = acceptanceAuthorEntry(issue).attempts.flatMap((attempt) => attempt.steps);
  const write = steps.find((step) => 'write' in step && step.write.path === ACCEPTANCE_MANIFEST_PATH);
  return write !== undefined && 'write' in write ? write.write.content : null;
}

function manifestReading(context: ProjectContext, entry: NumberedIssue) {
  const type = context.settings.conventions.typology.get(entry.issue.spec.type);
  return readAcceptanceManifest(manifestTextOf(entry.issue), specOf(entry), type);
}

function manifestOf(context: ProjectContext, entry: NumberedIssue): AcceptanceManifest {
  const reading = manifestReading(context, entry);
  if (!reading.valid) throw new Error(`the manifest of ${entry.issue.key} is refused: ${reading.problems.join('; ')}`);
  return reading.manifest;
}

function failureReport(outcome: GateOutcome): string {
  return outcome.steps
    .filter((step) => step.outcome === 'failed')
    .map((step) => `${step.name}:\n${step.output.split(NEWLINE).slice(-FAILURE_OUTPUT_LINES).join(NEWLINE)}`)
    .join(NEWLINE);
}

function failingCriteriaOf(outcome: GateOutcome): readonly number[] {
  const failed = outcome.acceptance?.tests.filter((test) => test.outcome !== 'passed') ?? [];
  const numbers = failed.flatMap((test) => [...test.id.matchAll(NAMED_CRITERION_PATTERN)].map((match) => Number(match[CRITERION_GROUP])));
  return [...new Set(numbers)].sort((left, right) => left - right);
}

function firstFailedStep(outcome: GateOutcome | undefined): string | undefined {
  return outcome?.steps.find((step) => step.outcome === 'failed')?.name;
}

function stepNamesOf(stage: GateStage, gate: PipelineSettings['gate']): readonly string[] {
  if (stage === 'acceptance') return [GATE_STEP_NAMES.acceptance];
  return (stage === 'before-acceptance' ? gate.commandsBeforeAcceptance : gate.commandsAfterAcceptance).map((command) => command.name);
}

function pathsWrittenBy(attempt: StoryAttempt): readonly string[] {
  return [...attempt.writes.map((file) => file.path), ...attempt.deletes];
}

function filesOfIssue(work: StoryWork): readonly StoryFile[] {
  return [...work.checks.files, ...work.attempts.flatMap((attempt) => attempt.writes)];
}

function everyFileOf(story: ProjectStory): readonly StoryFile[] {
  return [...story.issues, ...story.proposedIssues].flatMap(filesOfIssue).concat(story.outsideChanges.flatMap((change) => change.files));
}

function declaredSize(drawing: string | null | undefined): ReturnType<typeof imageSize> {
  return imageSize(new TextEncoder().encode(drawing ?? ''));
}

function diffOf(files: readonly StoryFile[]): string {
  return files.map((file) => `${file.path}${NEWLINE}${file.content}`).join(NEWLINE);
}

function challengedRequests(story: ProjectStory): readonly (StoryRequest & { readonly challenge: ChallengeAnswer })[] {
  return story.requests.flatMap((request) => (request.challenge === null ? [] : [{ ...request, challenge: request.challenge }]));
}

function selectedEntry(role: ScenarioEntry['role'], prompt: string): ScenarioEntry | undefined {
  return SCENARIO.entries.find((entry) => entry.role === role && prompt.includes(entry.when));
}

function hostsIn(text: string): readonly string[] {
  return [...text.matchAll(URL_HOST), ...text.matchAll(EMAIL_HOST)].map((match) => match[HOST_GROUP] ?? '');
}

describe.each(CONTEXTS)('the content for the $story.project project', (context) => {
  const { story, demo, settings } = context;
  const { conventions } = settings;
  const proposed = story.proposedIssues.map((work) => issueOfProposed(story, work));
  const scripted = numbered([...story.issues, ...proposed]);

  describe('requests', () => {
    it('opens each request with its title and attributes it to someone on the team', () => {
      for (const request of story.requests) {
        expect(requestTitleOf(request.body), request.key).toBe(request.title);
        expect(TEAM, request.key).toContain(request.requester);
      }
    });

    it('selects the scripted challenger from the request alone', () => {
      for (const request of story.requests) {
        expect(selectedEntry('challenger', request.body)?.when, request.key).toBe(request.challenge === null ? undefined : request.title);
      }
    });

    for (const request of challengedRequests(story)) {
      it(`answers "${request.title}" with a challenge the factory accepts, of a type the project declares`, () => {
        const parsed = ChallengeAnswerSchema.safeParse(request.challenge);
        expect(parsed.success ? '' : parsed.error.message).toBe('');
        for (const spec of request.challenge.specs) {
          expect(conventions.typology.has(spec.type), `${spec.title} has the type ${spec.type}`).toBe(true);
          const rendered = renderSpecFile(spec, conventions);
          expect(rendered.problems, spec.title).toEqual([]);
          expect(() => planIssueCreation(rendered.content, null, conventions), spec.title).not.toThrow();
        }
      });

      it(`keeps the items of "${request.title}" consistent with its specs and the positions the operator accepts`, () => {
        const { items, specs } = request.challenge;
        items.forEach((item, index) => {
          const answeredBy = specs.filter((spec) => spec.items.includes(index + FIRST_POSITION));
          expect(answeredBy.length > 0, `${item.title}: ${item.verdict}`).toBe(KEPT_VERDICTS.includes(item.verdict));
          expect(item.question !== null, item.title).toBe(item.verdict === 'ask');
        });
        for (const position of request.accept) expect(specs[position], `accepted position ${position}`).toBeDefined();
      });

      it(`cites only lines of the repository that exist in "${request.title}"`, () => {
        inWorkspace(StoryWorkspace.create(demo), (workspace) => {
          expect(unresolvedReferences(workspace, collectStrings(request.challenge))).toEqual([]);
        });
      });
    }
  });

  for (const entry of scripted) {
    const { issue } = entry;

    describe(`${proposed.includes(issue) ? 'proposed issue' : 'issue'} ${issue.key}`, () => {
      it('becomes an issue of the project without problems', () => {
        const rendered = renderSpecFile(issue.spec, conventions);
        expect(rendered.problems).toEqual([]);
        expect(() => planIssueCreation(rendered.content, null, conventions)).not.toThrow();
      });

      it('has a manifest that the factory accepts, with a proving check for every criterion', () => {
        const reading = manifestReading(context, entry);
        expect(reading.valid ? [] : reading.problems).toEqual([]);
        expect(new Set(checkPaths(manifestOf(context, entry)))).toEqual(new Set(issue.checks.files.map((file) => file.path)));
        expect(manifestOf(context, entry).evidence).toEqual(issue.checks.evidence);
      });

      for (const kind of baseKindsOf(story, issue)) {
        it(`fails its checks on the ${kind} base on assertions only`, () => {
          const manifest = manifestOf(context, entry);
          inWorkspace(prepareBase(demo, story, issue, kind), (workspace) => {
            workspace.write(issue.checks.files);
            const { outcome, evaluation } = proveOnBase(workspace, manifest);
            expect(outcome.exitCode).not.toBe(0);
            expect(outcome.output).toMatch(ASSERTION_FAILURE);
            expect(outcome.output).not.toMatch(OTHER_FAILURE);
            expect(evaluation.problems).toEqual([]);
            expect(evaluation.failingCriteria).toEqual(criteriaOf(entry));
            expect(evaluation.tests.every((test) => test.outcome === 'failed' && test.failureKind === 'assertion')).toBe(true);
          });
        });

        it(`is refused by the gate after every attempt but the last, and passes after the last, on the ${kind} base`, () => {
          const manifest = manifestOf(context, entry);
          inWorkspace(prepareBase(demo, story, issue, kind), (workspace) => {
            workspace.write(issue.checks.files);
            const { evaluation } = proveOnBase(workspace, manifest);
            const outcomes = issue.attempts.map((attempt) => {
              applyAttempt(workspace, attempt);
              return runGate(workspace, settings.gate, manifest, evaluation.tests);
            });
            const refused = outcomes.slice(0, -1);
            refused.forEach((outcome, index) => expect(outcome.passed, `attempt ${index + FIRST_POSITION} is refused`).toBe(false));
            const last = outcomes.at(-1);
            expect(last === undefined ? 'no attempt' : failureReport(last)).toBe('');
            expect(last?.passed).toBe(true);
            (EXPECTED_REFUSALS[issue.key] ?? []).forEach((refusal, index) => {
              const outcome = refused[index];
              expect(stepNamesOf(refusal.stage, settings.gate), `the step that refuses attempt ${index + FIRST_POSITION}`).toContain(firstFailedStep(outcome));
              expect(outcome === undefined ? [] : failingCriteriaOf(outcome), `the criteria that fail after attempt ${index + FIRST_POSITION}`).toEqual(refusal.failingCriteria);
            });
          });
        });
      }

      if (issue.checks.evidence.length > 0) {
        it('draws the evidence it declares on the base and on the branch, and the two drawings differ', () => {
          const manifest = manifestOf(context, entry);
          inWorkspace(prepareBase(demo, story, issue, 'starting'), (workspace) => {
            workspace.write(issue.checks.files);
            const base = proveOnBase(workspace, manifest);
            const outcomes = issue.attempts.map((attempt) => {
              applyAttempt(workspace, attempt);
              return runGate(workspace, settings.gate, manifest, base.evaluation.tests);
            });
            const branch = outcomes.at(-1);
            expect(branch?.passed).toBe(true);
            for (const path of issue.checks.evidence) {
              const before = base.evidence.get(path);
              const after = branch?.evidence.get(path);
              expect(typeof before, `${path} after the base run`).toBe('string');
              expect(typeof after, `${path} after the branch run`).toBe('string');
              expect(after, `${path} on the branch and on the base`).not.toBe(before);
              expect(declaredSize(before), `the size ${path} declares`).not.toBeNull();
              expect(declaredSize(after), `the size ${path} declares on the branch`).toEqual(declaredSize(before));
              expect(workspace.readIfPresent(path), `${path} once the factory has cleared its outputs`).toBeNull();
            }
          });
        });

        it('keeps the evidence it declares out of version control, because every later gate runs the check again and rewrites it', () => {
          inWorkspace(StoryWorkspace.create(demo), (workspace) => {
            const ignored = workspace.read(GITIGNORE).split(NEWLINE).map((line) => line.trim());
            for (const path of issue.checks.evidence) {
              expect(ignored.some((entry) => entry === path || (entry.endsWith('/') && path.startsWith(entry))), `${path} is ignored by ${GITIGNORE}`).toBe(true);
            }
          });
        });
      }

      it('never writes or removes a frozen check, nor a path outside the repository', () => {
        const frozen = new Set(checkPaths(manifestOf(context, entry)));
        for (const attempt of issue.attempts) {
          for (const path of pathsWrittenBy(attempt)) {
            expect(frozen.has(path), `${path} is frozen`).toBe(false);
            expect(isSafeRelativePath(path), `${path} is a relative path`).toBe(true);
            expect(RESERVED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)), `${path} is reserved`).toBe(false);
          }
        }
      });

      it('reports review findings the factory understands, none of them blocking', () => {
        for (const finding of issue.review.findings) {
          expect(REVIEW_SEVERITIES).toContain(finding.severity);
          expect(REVIEW_CATEGORIES).toContain(finding.category);
          expect(finding.severity).toBe('non-blocking');
          expect(finding.summary.trim()).not.toBe('');
          expect(finding.file === null).toBe(finding.line === null);
        }
      });

      it('cites only lines that exist: in the decision before the work, in the review once it is done', () => {
        inWorkspace(prepareBase(demo, story, issue, 'starting'), (workspace) => {
          expect(unresolvedReferences(workspace, issue.decision === null ? [] : [issue.decision])).toEqual([]);
          workspace.write(issue.checks.files);
          for (const attempt of issue.attempts) applyAttempt(workspace, attempt);
          const cited = issue.review.findings.flatMap((finding) => (finding.file === null ? [] : [`${finding.file}:${finding.line}`]));
          expect(unresolvedReferences(workspace, [...cited, ...collectStrings(issue.review)])).toEqual([]);
        });
      });

      it('selects its own scripted agents from the prompts the factory builds', () => {
        const spec = specValue(specOf(entry));
        const checks = checksValue(issue.checks.files);
        const prompts = {
          'acceptance-author': [spec, conventions.typology.get(issue.spec.type).checks].join(NEWLINE),
          implementer: [spec, checks, issue.decision ?? ''].join(NEWLINE),
          reviewer: [spec, checks, diffOf(filesOfIssue(issue))].join(NEWLINE),
        } as const;
        for (const [role, prompt] of Object.entries(prompts) as [keyof typeof prompts, string][]) {
          expect(selectedEntry(role, prompt)?.when, `the ${role} of ${issue.key}`).toBe(issue.spec.title);
        }
      });

      it('keeps the titles of the other issues out of its specification, its checks and its code', () => {
        const own = [...collectStrings(issue.spec), diffOf(filesOfIssue(issue)), issue.decision ?? ''].join(NEWLINE).toLowerCase();
        const others = SCENARIO.entries.filter((candidate) => candidate.role === 'implementer' && candidate.when !== issue.spec.title);
        for (const other of others) expect(own.includes(other.when.toLowerCase()), `${issue.key} mentions "${other.when}"`).toBe(false);
      });
    });
  }

  for (const change of story.outsideChanges) {
    describe(`outside change ${change.key}`, () => {
      it('keeps the gate of the project passing when it lands alone on the base', () => {
        inWorkspace(StoryWorkspace.create(demo), (workspace) => {
          workspace.write(change.files);
          const outcome = runGate(workspace, settings.gate, null, []);
          expect(failureReport(outcome)).toBe('');
          expect(outcome.passed).toBe(true);
        });
      });

      it('is audited exactly when the project does not name its author as another automation', () => {
        const attribution = attributeCommit(
          { authorLogin: change.author.login, pullRequestNumber: null, pullRequestBranch: change.branch, pullRequestLabels: [] },
          attributionRules(conventions),
        );
        expect(attribution.kind === 'audit', attribution.kind).toBe(change.verdict !== null);
      });

      it('carries a verdict the factory accepts, whose evidence exists', () => {
        if (change.verdict === null) return;
        expect(AuditVerdictSchema.safeParse(change.verdict).success).toBe(true);
        expect(change.verdict.findings.length).toBeGreaterThan(0);
        inWorkspace(StoryWorkspace.create(demo), (workspace) => {
          workspace.write(change.files);
          expect(unresolvedReferences(workspace, collectStrings(change.verdict))).toEqual([]);
        });
      });

      it('selects its scripted auditor from the change description and the diff', () => {
        if (change.verdict === null) return;
        const description = renderChangeDescription({
          commitSha: 'a'.repeat(COMMIT_SHA_LENGTH),
          commitMessage: change.message,
          authorLogin: change.author.login,
          pullRequest: null,
          changedFiles: change.files.map((file) => file.path),
          diff: diffOf(change.files),
        });
        expect(selectedEntry('auditor', `${description}${NEWLINE}${diffOf(change.files)}`)?.when).toBe(change.message);
      });
    });
  }

  describe('as a whole', () => {
    it('scripts the work of every spec its challenges propose, and of no other spec', () => {
      const proposedByChallenges = challengedRequests(story).flatMap((request) => request.challenge.specs.map((spec) => singleLine(spec.title)));
      expect(story.proposedIssues.map((work) => work.title).sort()).toEqual([...proposedByChallenges].sort());
    });

    it('names its issues and their titles once, and lets each wait only on earlier issues', () => {
      const keys = scripted.map(({ issue }) => issue.key);
      const titles = scripted.map(({ issue }) => issue.spec.title.toLowerCase());
      expect(new Set(keys).size).toBe(keys.length);
      expect(new Set(titles).size).toBe(titles.length);
      story.issues.forEach((issue, index) => {
        for (const key of issue.dependsOn) expect(keys.indexOf(key), `${issue.key} waits on ${key}`).toBeLessThan(index);
      });
    });

    it('merges validated issues, the first of which is the one the scheduler starts first', () => {
      for (const key of story.merges) expect(story.issues.find((issue) => issue.key === key)?.validate, key).toBe(true);
      const [first] = story.merges;
      if (first !== undefined) expect(story.issues[0]?.key).toBe(first);
    });

    it('starts every issue from a base that holds the issues it waits on', () => {
      for (const issue of story.issues) {
        const landed = changesBefore(story, issue, 'landed');
        for (const dependency of dependenciesOf(story, issue)) {
          expect(landed.some((change) => change.kind === 'issue' && change.issue === dependency), `${issue.key} after ${dependency.key}`).toBe(true);
        }
      }
    });

    it('gives each file to one change only', () => {
      const owners = new Map<string, string>();
      const claim = (path: string, owner: string): void => {
        const previous = owners.get(path);
        expect(previous === undefined || previous === owner, `${path} is written by ${previous} and by ${owner}`).toBe(true);
        owners.set(path, owner);
      };
      for (const { issue } of scripted) for (const file of filesOfIssue(issue)) claim(file.path, issue.key);
      for (const change of story.outsideChanges) for (const file of change.files) claim(file.path, change.key);
    });

    it('keeps the gate passing once every issue and proposed issue has merged and every outside change has landed', () => {
      inWorkspace(prepareEverything(demo, story), (workspace) => {
        const outcome = runGate(workspace, settings.gate, null, []);
        expect(failureReport(outcome)).toBe('');
        expect(outcome.passed).toBe(true);
      });
    });

    it('releases a version that follows the last tag of its history and fits the release model', () => {
      if (story.release === null) return;
      const tags = demo.history.flatMap((commit) => (commit.tag === null ? [] : [commit.tag]));
      const version = releaseVersionOf(story.release);
      const last = releaseVersionOf(tags.at(-1) ?? '');
      expect(version).not.toBeNull();
      expect(last).not.toBeNull();
      expect(compareVersions(version ?? '', last ?? '')).toBeGreaterThan(0);
      const release = projectOf(CONFIGURATION, story.project).delivery.release;
      expect(release.kind).toBe('tags');
      expect(release.kind === 'tags' && matchesAnyGlob(story.release, [release.tagPattern])).toBe(true);
    });

    it('reads as a real team at work: nothing about a demonstration, only reserved hosts, no code fence in an answer', () => {
      const example = [...filesUnder(join(EXAMPLES_DIRECTORY, demo.example))].flat();
      const prose = [...collectStrings(story), ...example];
      for (const pattern of MENTIONS_OF_THE_DEMONSTRATION) {
        expect(prose.filter((text) => pattern.test(text)).map((text) => text.slice(0, 80)), String(pattern)).toEqual([]);
      }
      const addressed = prose.map((text) => text.replaceAll(SVG_NAMESPACE, ''));
      expect(addressed.flatMap(hostsIn).filter((host) => !ALLOWED_HOST.test(host))).toEqual([]);
      const answers = collectStrings([
        story.requests.map((request) => request.challenge),
        story.outsideChanges.map((change) => change.verdict),
        scripted.map(({ issue }) => [issue.review, issue.decision]),
      ]);
      expect(answers.filter((text) => text.includes(CODE_FENCE))).toEqual([]);
    });

    it('writes only paths inside the repository', () => {
      for (const file of everyFileOf(story)) {
        expect(isSafeRelativePath(file.path), file.path).toBe(true);
        expect(RESERVED_PATH_PREFIXES.some((prefix) => file.path.startsWith(prefix)), file.path).toBe(false);
      }
    });
  });
});

it('has an issue whose checks draw an image for the pull request to show', () => {
  expect(STORIES.flatMap((story) => story.issues).some((issue) => issue.checks.evidence.length > 0)).toBe(true);
});
