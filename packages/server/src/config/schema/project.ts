import { z } from 'zod';
import { LOCAL_CHECK_MODES } from '@agent-factory/adapters';
import {
  DEFAULT_AUDIT_LABEL,
  DEFAULT_BRANCH_PREFIX,
  DEFAULT_COMMIT_SCOPE,
  DEFAULT_FACTORY_LABEL,
  DEFAULT_FILM_REPLAY_FILE,
  DEFAULT_FILM_TIMEOUT_MINUTES,
  DEFAULT_KIND_LABEL_PREFIX,
  DEFAULT_VALIDATED_LABEL,
  filmCommandProblems,
  isTimeZone,
} from '@agent-factory/application';
import {
  AGENT_ROLES,
  COMMIT_KINDS,
  DEFAULT_DELEGATE_ACTOR,
  DEFAULT_ISSUE_TYPES,
  DEFAULT_TYPE_LABEL_PREFIX,
  DELEGATE_ACTOR_RULE,
  EVIDENCE_KINDS,
  isDelegateActor,
  MERGE_CONDITIONS,
  PROMOTION_POLICIES,
  PROOF_STRATEGIES,
  REFERENCE_NAME_MAX_LENGTH,
  REFERENCE_NAME_PATTERN,
  REFERENCE_NAME_RULE,
  REFERENCE_REVISION_MAX_LENGTH,
  REFERENCE_REVISION_PATTERN,
  REFERENCE_REVISION_RULE,
  REVIEW_FOCUSES,
  isProductionLookingName,
  unknownMergeTypes,
} from '@agent-factory/domain';
import {
  EnvironmentSetSchema,
  EnvironmentVariableName,
  Identifier,
  NamedCommandSchema,
  Niceness,
  NonEmptyString,
  PathString,
  PositiveMinutes,
  PositiveSeconds,
  RoleOverrideSchema,
  uniqueBy,
} from './common.ts';
import { CheckEnvironmentSchema, SandboxSettingsSchema, ToolChecksSchema } from './installation.ts';

export const DEFAULT_BASE_BRANCH = 'main';
export const DEFAULT_CLONE_DIRECTORY = 'clone';
export const DEFAULT_LOCAL_FORGE_DIRECTORY = 'forge';
export const DEFAULT_LOCAL_CHECKS = 'none';
export const DEFAULT_WORKTREE_POOL_SIZE = 5;
export const DEFAULT_ISSUE_CONCURRENCY = 1;
export const DEFAULT_CONCURRENCY_CEILING = 3;
export const DEFAULT_GATE_TIMEOUT_MINUTES = 30;
export const DEFAULT_GATE_NICENESS = 10;
/** Tags that look like a version, such as v1.4.0 or storefront-v1.4.0. */
export const DEFAULT_TAG_PATTERN = '*.*.*';
export const DEFAULT_HEALTH_INTERVAL_MINUTES = 5;
/** Scale-to-zero environments answer once awake; a release gate waits this long for them. */
export const DEFAULT_WAKE_UP_SECONDS = 90;
export const DEFAULT_STACK_READY_TIMEOUT_SECONDS = 120;
export const DEFAULT_STACK_STOP_GRACE_SECONDS = 10;
export const DEFAULT_EVIDENCE_MAX_FILE_BYTES = 5_000_000;
export const DEFAULT_EVIDENCE_MAX_TOTAL_BYTES = 40_000_000;
export const FORGE_KINDS = ['github', 'local'] as const;
export type ForgeKind = (typeof FORGE_KINDS)[number];
export const DEPLOYMENT_SOURCE_KINDS = ['github', 'none'] as const;

export const REPOSITORY_SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RepositorySlug = z.string().regex(REPOSITORY_SLUG, 'must be owner/name');

const ForgeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('github'),
    repository: RepositorySlug,
    /** Merge with `gh pr merge --admin`, for an operator the base branch's rules let bypass the required review. */
    mergeWithBypass: z.boolean().default(false),
  }),
  z.strictObject({
    kind: z.literal('local'),
    /** The name the rehearsal forge shows; nothing is sent to a remote forge. */
    repository: RepositorySlug,
    directory: PathString.default(DEFAULT_LOCAL_FORGE_DIRECTORY),
    checks: z.enum(LOCAL_CHECK_MODES).default(DEFAULT_LOCAL_CHECKS),
  }),
]);

const ConventionsSchema = z
  .strictObject({
    branchPrefix: NonEmptyString.default(DEFAULT_BRANCH_PREFIX),
    labels: z
      .strictObject({
        factory: NonEmptyString.default(DEFAULT_FACTORY_LABEL),
        validated: NonEmptyString.default(DEFAULT_VALIDATED_LABEL),
        audit: NonEmptyString.default(DEFAULT_AUDIT_LABEL),
        typePrefix: NonEmptyString.default(DEFAULT_TYPE_LABEL_PREFIX),
        kindPrefix: NonEmptyString.default(DEFAULT_KIND_LABEL_PREFIX),
      })
      .prefault({}),
    defaultScope: NonEmptyString.default(DEFAULT_COMMIT_SCOPE),
  })
  .prefault({});

const CommitPathRuleSchema = z.strictObject({ paths: z.array(NonEmptyString).min(1), type: z.enum(COMMIT_KINDS) });

export const IssueTypeSchema = z.strictObject({
  id: Identifier,
  label: NonEmptyString.optional(),
  proof: z.enum(PROOF_STRATEGIES),
  checks: NonEmptyString.optional(),
  commit: z.strictObject({
    type: z.enum(COMMIT_KINDS),
    scope: NonEmptyString.optional(),
    whenChanged: z.array(CommitPathRuleSchema).default([]),
  }),
  evidence: z.array(z.enum(EVIDENCE_KINDS)).optional(),
  review: z.array(z.enum(REVIEW_FOCUSES)).default([]),
  paths: z.array(NonEmptyString).default([]),
});
export type RawIssueType = z.infer<typeof IssueTypeSchema>;

const HealthCheckSchema = z.strictObject({ name: NonEmptyString, url: z.url() });

const DeploymentSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('github'), environment: NonEmptyString }),
  z.strictObject({ kind: z.literal('none') }),
]);

const RedeploySchema = z.strictObject({
  workflow: NonEmptyString,
  /** Inputs of the dispatched workflow; `{{target}}` and `{{version}}` are replaced by the deployment target and version. */
  inputs: z.record(z.string(), z.string()).default({}),
});

const EnvironmentSchema = z.strictObject({
  name: Identifier,
  production: z.boolean().default(false),
  promotion: z.enum(PROMOTION_POLICIES),
  deployments: DeploymentSourceSchema.prefault({ kind: 'none' }),
  health: z.array(HealthCheckSchema).default([]),
  /** How long a release gate lets the environment wake up before its failing health checks count; 0 for an always-on environment. */
  wakeUpSeconds: z.number().min(0).default(DEFAULT_WAKE_UP_SECONDS),
  redeploy: RedeploySchema.optional(),
  workflowUrl: z.url().optional(),
});
export type RawEnvironment = z.infer<typeof EnvironmentSchema>;

const ReleaseModelSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('release-please'), tagPattern: NonEmptyString.default(DEFAULT_TAG_PATTERN) }),
  z.strictObject({ kind: z.literal('tags'), tagPattern: NonEmptyString.default(DEFAULT_TAG_PATTERN) }),
  z.strictObject({ kind: z.literal('none') }),
]);

const DeliverySchema = z
  .strictObject({
    release: ReleaseModelSchema.prefault({ kind: 'none' }),
    environments: z.array(EnvironmentSchema).default([]),
    /** How often the health checks of every environment are sampled. */
    healthIntervalMinutes: PositiveMinutes.default(DEFAULT_HEALTH_INTERVAL_MINUTES),
  })
  .superRefine((delivery, context) => {
    for (const name of uniqueBy(delivery.environments, (environment) => environment.name)) {
      context.addIssue({ code: 'custom', path: ['environments'], message: `environment ${name} is declared twice` });
    }
    delivery.environments.forEach((environment, index) => {
      if (environment.redeploy === undefined) return;
      if (environment.production || isProductionLookingName(environment.name)) {
        context.addIssue({
          code: 'custom',
          path: ['environments', index, 'redeploy'],
          message: 'production is never deployed by the factory: remove redeploy from this environment',
        });
      }
    });
  });

const AuditIgnoreSchema = z
  .strictObject({
    name: NonEmptyString,
    /** Globs over the head branch of the change's pull request. */
    branches: z.array(NonEmptyString).default([]),
    /** Globs over the login of the change's author. */
    authors: z.array(NonEmptyString).default([]),
  })
  .refine((automation) => automation.branches.length > 0 || automation.authors.length > 0, {
    message: 'names at least one branch or author glob',
  });

const AuditsSchema = z
  .strictObject({
    /** Other automations of the repository: their changes are recorded but not audited. */
    ignore: z.array(AuditIgnoreSchema).default([]),
  })
  .prefault({});

const StackServiceSchema = z.strictObject({
  name: Identifier,
  /** The long-running command, started in the workspace under test and stopped with its whole process group. */
  run: NonEmptyString,
  /** A command that succeeds once the service answers, such as a request to its health endpoint. */
  ready: NonEmptyString,
  readyTimeoutSeconds: PositiveSeconds.default(DEFAULT_STACK_READY_TIMEOUT_SECONDS),
  /** Why the service needs the network; without it the service has none beyond the host's loopback. */
  network: NonEmptyString.optional(),
});

const StackSchema = z
  .strictObject({
    /** Commands that bring what the services need up, then return, such as starting a database container. */
    setup: z.array(NamedCommandSchema).default([]),
    services: z.array(StackServiceSchema).default([]),
    /** Commands that bring the setup down again; they run whatever happened, and again for a stack a stopped factory left. */
    teardown: z.array(NamedCommandSchema).default([]),
    environment: EnvironmentSetSchema.default({}),
    /** The issue types whose checks need the stack; every type when empty. */
    issueTypes: z.array(Identifier).default([]),
    stopGraceSeconds: PositiveSeconds.default(DEFAULT_STACK_STOP_GRACE_SECONDS),
  })
  .superRefine((stack, context) => {
    for (const name of uniqueBy(stack.services, (service) => service.name)) context.addIssue({ code: 'custom', path: ['services'], message: `service ${name} is declared twice` });
  });

/** Another repository that specifications cite, read as a snapshot of the files of a local clone at a tag or a commit. */
const ReferenceSchema = z.strictObject({
  name: z.string().max(REFERENCE_NAME_MAX_LENGTH).regex(REFERENCE_NAME_PATTERN, `must be ${REFERENCE_NAME_RULE}`),
  /** The `owner/name` the specifications cite. */
  repository: RepositorySlug,
  ref: z.string().max(REFERENCE_REVISION_MAX_LENGTH).regex(REFERENCE_REVISION_PATTERN, `must be ${REFERENCE_REVISION_RULE}`),
  /** A local clone that holds the ref; `git -C <source> fetch --tags` brings a missing tag in. */
  source: PathString,
});

/** The file the first recording writes: a plain file name, so that it stays inside the recording's output directory. */
const REPLAY_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const FilmsSchema = z
  .strictObject({
    /**
     * The argument template of the film command, run outside any sandbox with the operator's environment.
     * It holds `{ref}`, `{output}` and `{scenario}`, and may hold `{replay}` after an option such as `--replay`.
     */
    command: z.array(NonEmptyString).min(1),
    /** Where the command runs: its tool's directory; relative to the project's directory. */
    workingDirectory: PathString,
    /** Added to the operator's environment for the command; unlike check commands, credential-looking names are allowed. */
    environment: z.record(EnvironmentVariableName, z.string()).default({}),
    timeoutMinutes: PositiveMinutes.default(DEFAULT_FILM_TIMEOUT_MINUTES),
    /** The file the recording of the base writes in its output directory and the recording of the head replays. */
    replayFile: z.string().regex(REPLAY_FILE_NAME, 'must be a file name').default(DEFAULT_FILM_REPLAY_FILE),
    /** The zone of the expected arrival times; the machine's zone when absent. */
    timeZone: NonEmptyString.refine(isTimeZone, { message: 'is not a time zone name such as Europe/Paris' }).optional(),
  })
  .superRefine((films, context) => {
    for (const problem of filmCommandProblems(films.command)) context.addIssue({ code: 'custom', path: ['command'], message: problem });
  });

/** Lets the delegate merge the pull requests of some issue types, once the conditions hold. */
const MergeRuleSchema = z.strictObject({
  /** The ids of the issue types the rule covers; each has to be a type of the project. */
  types: z.array(Identifier).min(1),
  requires: z.array(z.enum(MERGE_CONDITIONS)).default([]),
});

/** What the project delegates to its orchestrator; without any of it, every gesture stays the operator's. */
const AutonomySchema = z
  .strictObject({
    /** Who acts for the operator: the `--as` of the command line has to name it. */
    actor: z.string().refine(isDelegateActor, { message: `must be ${DELEGATE_ACTOR_RULE}` }).default(DEFAULT_DELEGATE_ACTOR),
    validateSpecs: z.boolean().default(false),
    answerDecisions: z.boolean().default(false),
    resume: z.boolean().default(false),
    merge: z.array(MergeRuleSchema).default([]),
  })
  .prefault({});

const KnowledgeSourceSchema = z.union([z.strictObject({ path: PathString }), z.strictObject({ repository: PathString })]);

const RoleKey = z.enum(AGENT_ROLES);

export const ProjectSchema = z
  .strictObject({
    id: Identifier,
    name: NonEmptyString,
    forge: ForgeSchema,
    baseBranch: NonEmptyString.default(DEFAULT_BASE_BRANCH),
    clone: PathString.default(DEFAULT_CLONE_DIRECTORY),
    commitIdentity: z.strictObject({ name: NonEmptyString, email: z.email() }),
    conventions: ConventionsSchema,
    worktrees: z.strictObject({ size: z.number().int().positive().default(DEFAULT_WORKTREE_POOL_SIZE) }).prefault({}),
    concurrency: z
      .strictObject({
        issues: z.number().int().positive().default(DEFAULT_ISSUE_CONCURRENCY),
        ceiling: z.number().int().positive().default(DEFAULT_CONCURRENCY_CEILING),
      })
      .prefault({}),
    setup: z.array(NamedCommandSchema).default([]),
    gate: z
      .strictObject({
        beforeAcceptance: z.array(NamedCommandSchema).default([]),
        afterAcceptance: z.array(NamedCommandSchema).default([]),
        timeoutMinutes: PositiveMinutes.default(DEFAULT_GATE_TIMEOUT_MINUTES),
        niceness: Niceness.nullable().default(DEFAULT_GATE_NICENESS),
      })
      .prefault({}),
    environment: CheckEnvironmentSchema.optional(),
    /** What the acceptance checks need running around them, owned by the factory. */
    stack: StackSchema.optional(),
    sandbox: SandboxSettingsSchema.optional(),
    secretScan: z.strictObject({ keychainServices: z.array(NonEmptyString).default([]) }).prefault({}),
    issueTypes: z.array(IssueTypeSchema).min(1).optional(),
    roles: z.partialRecord(RoleKey, RoleOverrideSchema).default({}),
    prompts: z.partialRecord(RoleKey, PathString).default({}),
    knowledge: z.array(KnowledgeSourceSchema).default([]),
    references: z.array(ReferenceSchema).default([]),
    evidence: z
      .strictObject({
        maxFileBytes: z.number().int().positive().default(DEFAULT_EVIDENCE_MAX_FILE_BYTES),
        maxTotalBytes: z.number().int().positive().default(DEFAULT_EVIDENCE_MAX_TOTAL_BYTES),
        /** Films a pull request records against its base and its head with a command of the project; absent, nothing is filmed. */
        films: FilmsSchema.optional(),
      })
      .prefault({}),
    delivery: DeliverySchema.prefault({}),
    audits: AuditsSchema,
    autonomy: AutonomySchema,
    tools: ToolChecksSchema,
  })
  .superRefine((project, context) => {
    if (project.concurrency.issues > project.concurrency.ceiling) {
      context.addIssue({ code: 'custom', path: ['concurrency', 'issues'], message: 'must not exceed concurrency.ceiling' });
    }
    if (project.concurrency.ceiling > project.worktrees.size) {
      context.addIssue({ code: 'custom', path: ['concurrency', 'ceiling'], message: 'must not exceed worktrees.size: every running issue holds a worktree' });
    }
    const types = project.issueTypes ?? [];
    for (const id of uniqueBy(types, (type) => type.id)) context.addIssue({ code: 'custom', path: ['issueTypes'], message: `issue type ${id} is declared twice` });
    const labels = types.map((type) => type.label ?? `${project.conventions.labels.typePrefix}${type.id}`);
    for (const label of uniqueBy(labels, (label) => label)) context.addIssue({ code: 'custom', path: ['issueTypes'], message: `label ${label} marks two issue types` });
    for (const name of uniqueBy(project.references, (reference) => reference.name)) {
      context.addIssue({ code: 'custom', path: ['references'], message: `reference ${name} is declared twice` });
    }
    const typeIds = new Set(project.issueTypes?.map((type) => type.id) ?? DEFAULT_ISSUE_TYPES.map((type) => type.id));
    for (const id of project.stack?.issueTypes ?? []) {
      if (!typeIds.has(id)) context.addIssue({ code: 'custom', path: ['stack', 'issueTypes'], message: `issue type ${id} is not an issue type of the project` });
    }
    for (const id of unknownMergeTypes(project.autonomy, [...typeIds])) {
      context.addIssue({ code: 'custom', path: ['autonomy', 'merge'], message: `issue type ${id} is not an issue type of the project` });
    }
  });
export type RawProject = z.infer<typeof ProjectSchema>;
