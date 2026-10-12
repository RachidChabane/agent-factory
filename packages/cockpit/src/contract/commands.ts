import { z } from 'zod';
import { AGENT_ROLES, EFFORT_LEVELS, PAUSE_ABOVE_PRESSURE_LEVELS } from '@agent-factory/domain';
import { AmountSchema, CountSchema, IssueNumberSchema, IssueTypeIdSchema, PercentSchema, ProjectIdSchema } from './primitives.ts';

const ProjectRefSchema = z.object({ project: ProjectIdSchema });
const RequestRefSchema = ProjectRefSchema.extend({ requestId: z.string().min(1) });
const IssueRefSchema = ProjectRefSchema.extend({ issueNumber: IssueNumberSchema });
const AuditRefSchema = ProjectRefSchema.extend({ auditId: z.string().min(1) });
const ReleaseRefSchema = ProjectRefSchema.extend({ releaseId: z.string().min(1) });
/** Run ids are unique across the installation, so a run command needs no project. */
const RunRefSchema = z.object({ runId: z.string().min(1) });
/** Null addresses the whole installation. */
const ScopeSchema = z.object({ project: ProjectIdSchema.nullable() });

export const PastedAttachmentSchema = z.object({
  name: z.string().min(1),
  mediaType: z.string().min(1),
  dataUrl: z.string().min(1),
});
export type PastedAttachment = z.infer<typeof PastedAttachmentSchema>;

export const SpecDraftSchema = z.object({
  title: z.string().min(1),
  type: IssueTypeIdSchema,
  need: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  outOfScope: z.array(z.string()),
  expectedProof: z.string().min(1),
});
export type SpecDraft = z.infer<typeof SpecDraftSchema>;

export const RoleChangeSchema = z.object({
  role: z.enum(AGENT_ROLES),
  model: z.string().min(1),
  effort: z.enum(EFFORT_LEVELS),
  maxBudgetUsd: AmountSchema,
  maxTurns: CountSchema,
});
export type RoleChange = z.infer<typeof RoleChangeSchema>;

export const COMMAND_BODY_SCHEMAS = {
  'request.create': ProjectRefSchema.extend({
    title: z.string().min(1),
    requester: z.string().min(1),
    body: z.string().min(1),
    attachments: z.array(PastedAttachmentSchema),
  }),
  'request.challenge': RequestRefSchema,
  'request.decline': RequestRefSchema.extend({ reason: z.string().min(1) }),
  'request.update-spec': RequestRefSchema.extend({ specId: z.string().min(1), spec: SpecDraftSchema }),
  /** `start` is the operator's explicit order to validate the created issues at once, so the factory takes them. */
  'request.accept': RequestRefSchema.extend({ specIds: z.array(z.string().min(1)).min(1), start: z.boolean().default(false) }),
  'issue.validate-spec': IssueRefSchema,
  'issue.start': IssueRefSchema,
  'issue.pause': IssueRefSchema,
  'issue.resume': IssueRefSchema,
  'issue.abandon': IssueRefSchema.extend({ reason: z.string().trim().min(1) }),
  'issue.rewrite-check': IssueRefSchema.extend({ path: z.string().min(1), instruction: z.string().min(1) }),
  'run.stop': RunRefSchema,
  'run.resume': RunRefSchema,
  'run.answer': RunRefSchema.extend({ questionId: z.string().min(1), answer: z.string().min(1) }),
  'pr.merge': ProjectRefSchema.extend({ number: IssueNumberSchema, expectedHeadSha: z.string().min(1) }),
  'pr.feedback': ProjectRefSchema.extend({ number: IssueNumberSchema, author: z.string().min(1), body: z.string().min(1) }),
  'deployment.redeploy': ProjectRefSchema.extend({ environment: z.string().min(1), confirmVersion: z.string().trim().min(1) }),
  'release.cut': ReleaseRefSchema,
  'release.evaluate': ReleaseRefSchema,
  'audit.request': ProjectRefSchema.extend({ commitSha: z.string().min(1) }),
  'audit.publish-issue': AuditRefSchema,
  'audit.resolve': AuditRefSchema.extend({ note: z.string().min(1) }),
  'scheduler.pause': ScopeSchema,
  /** No new work starts, and the factory process stops once its running work finishes, ready for a restart. */
  'factory.drain': z.object({}),
  'scheduler.resume': ScopeSchema,
  'usage.refresh': z.object({}),
  'tools.check': ScopeSchema.extend({ tool: z.string().min(1) }),
  'health.check': ProjectRefSchema.extend({ environment: z.string().min(1) }),
  'settings.update-role': ScopeSchema.extend({ change: RoleChangeSchema }),
  'settings.update-resources': z.object({
    minimumFreeMemoryPercent: PercentSchema,
    pauseAbovePressure: z.enum(PAUSE_ABOVE_PRESSURE_LEVELS),
    maxConcurrentRuns: CountSchema,
  }),
  'settings.update-budget': z.object({
    dailyCapUsd: AmountSchema.positive().nullable(),
    perRunCapUsd: AmountSchema.positive().nullable(),
  }),
  'settings.update-concurrency': ProjectRefSchema.extend({ issues: CountSchema, ceiling: CountSchema }),
} as const;

export type CommandName = keyof typeof COMMAND_BODY_SCHEMAS;
export type CommandBody<N extends CommandName> = z.infer<(typeof COMMAND_BODY_SCHEMAS)[N]>;

export const COMMAND_NAMES = Object.freeze(Object.keys(COMMAND_BODY_SCHEMAS));

/** What the factory did: the event that records it, when there is one, and the effect in words. */
export const CommandAcceptedSchema = z.object({ sequence: CountSchema.nullable(), effect: z.string().min(1) });
export type CommandAccepted = z.infer<typeof CommandAcceptedSchema>;

export const CommandRejectedSchema = z.object({ error: z.string() });
export type CommandRejected = z.infer<typeof CommandRejectedSchema>;
