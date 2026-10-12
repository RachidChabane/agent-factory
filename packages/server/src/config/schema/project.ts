import { z } from 'zod';
import { LOCAL_CHECK_MODES } from '@agent-factory/adapters';
import { AGENT_ROLES, COMMIT_KINDS, EVIDENCE_KINDS, PROMOTION_POLICIES, PROOF_STRATEGIES, REVIEW_FOCUSES, isProductionLookingName } from '@agent-factory/domain';
import {
  Identifier,
  NamedCommandSchema,
  Niceness,
  NonEmptyString,
  PathString,
  PositiveMinutes,
  RoleOverrideSchema,
  uniqueBy,
} from './common.ts';
import { CheckEnvironmentSchema, SandboxSettingsSchema, ToolChecksSchema } from './installation.ts';

export const DEFAULT_BASE_BRANCH = 'main';
export const DEFAULT_CLONE_DIRECTORY = 'clone';
export const DEFAULT_LOCAL_FORGE_DIRECTORY = 'forge';
export const DEFAULT_LOCAL_CHECKS = 'none';
export const DEFAULT_BRANCH_PREFIX = 'factory/';
export const DEFAULT_FACTORY_LABEL = 'factory';
export const DEFAULT_VALIDATED_LABEL = 'spec:validated';
export const DEFAULT_AUDIT_LABEL = 'audit';
export const DEFAULT_TYPE_LABEL_PREFIX = 'type:';
export const DEFAULT_KIND_LABEL_PREFIX = 'kind:';
export const DEFAULT_WORKTREE_POOL_SIZE = 3;
export const DEFAULT_ISSUE_CONCURRENCY = 1;
export const DEFAULT_CONCURRENCY_CEILING = 3;
export const DEFAULT_GATE_TIMEOUT_MINUTES = 30;
export const DEFAULT_GATE_NICENESS = 10;
export const DEFAULT_COMMIT_SCOPE = 'repo';
export const DEFAULT_TAG_PATTERN = 'v*';
export const DEFAULT_EVIDENCE_MAX_FILE_BYTES = 5_000_000;
export const DEFAULT_EVIDENCE_MAX_TOTAL_BYTES = 40_000_000;
export const FORGE_KINDS = ['github', 'local'] as const;
export const DEPLOYMENT_SOURCE_KINDS = ['github', 'none'] as const;

export const REPOSITORY_SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RepositorySlug = z.string().regex(REPOSITORY_SLUG, 'must be owner/name');

const ForgeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('github'), repository: RepositorySlug }),
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
  redeploy: RedeploySchema.optional(),
  workflowUrl: z.url().optional(),
});
export type RawEnvironment = z.infer<typeof EnvironmentSchema>;

const ReleaseModelSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('release-please') }),
  z.strictObject({ kind: z.literal('tags'), tagPattern: NonEmptyString.default(DEFAULT_TAG_PATTERN) }),
  z.strictObject({ kind: z.literal('none') }),
]);

const DeliverySchema = z
  .strictObject({
    release: ReleaseModelSchema.prefault({ kind: 'none' }),
    environments: z.array(EnvironmentSchema).default([]),
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

const AuditIgnoreSchema = z.strictObject({
  name: NonEmptyString,
  branches: z.array(NonEmptyString).default([]),
  authors: z.array(NonEmptyString).default([]),
});

const AuditsSchema = z
  .strictObject({
    enabled: z.boolean().default(true),
    /** Changes of other automations that are recorded but not audited. */
    ignore: z.array(AuditIgnoreSchema).default([]),
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
    sandbox: SandboxSettingsSchema.optional(),
    secretScan: z.strictObject({ keychainServices: z.array(NonEmptyString).default([]) }).prefault({}),
    issueTypes: z.array(IssueTypeSchema).min(1).optional(),
    roles: z.partialRecord(RoleKey, RoleOverrideSchema).default({}),
    prompts: z.partialRecord(RoleKey, PathString).default({}),
    knowledge: z.array(KnowledgeSourceSchema).default([]),
    evidence: z
      .strictObject({
        maxFileBytes: z.number().int().positive().default(DEFAULT_EVIDENCE_MAX_FILE_BYTES),
        maxTotalBytes: z.number().int().positive().default(DEFAULT_EVIDENCE_MAX_TOTAL_BYTES),
      })
      .prefault({}),
    delivery: DeliverySchema.prefault({}),
    audits: AuditsSchema,
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
  });
export type RawProject = z.infer<typeof ProjectSchema>;
