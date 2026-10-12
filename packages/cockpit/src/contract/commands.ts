import { z } from 'zod';
import { AGENT_ROLES, EFFORT_LEVELS, ISSUE_TYPES } from '@agent-factory/domain';
import { AmountSchema, CountSchema, IssueNumberSchema, PercentSchema } from './primitives.ts';
import { CostCapsSchema } from './snapshot.ts';
import { MEMORY_PRESSURES, TOOL_NAMES } from './vocabulary.ts';

const RequestRefSchema = z.object({ requestId: z.string().min(1) });
const IssueRefSchema = z.object({ issueNumber: IssueNumberSchema });
const RunRefSchema = z.object({ runId: z.string().min(1) });
const AuditRefSchema = z.object({ auditId: z.string().min(1) });
const ReleaseRefSchema = z.object({ releaseId: z.string().min(1) });

export const PastedAttachmentSchema = z.object({
  name: z.string().min(1),
  mediaType: z.string().min(1),
  dataUrl: z.string().min(1),
});
export type PastedAttachment = z.infer<typeof PastedAttachmentSchema>;

export const SpecDraftSchema = z.object({
  title: z.string().min(1),
  type: z.enum(ISSUE_TYPES),
  need: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  outOfScope: z.array(z.string()),
  expectedProof: z.string().min(1),
});
export type SpecDraft = z.infer<typeof SpecDraftSchema>;

export const COMMAND_BODY_SCHEMAS = {
  'request.create': z.object({
    title: z.string().min(1),
    requester: z.string().min(1),
    body: z.string().min(1),
    attachments: z.array(PastedAttachmentSchema),
  }),
  'request.challenge': RequestRefSchema,
  'request.decline': RequestRefSchema.extend({ reason: z.string().min(1) }),
  'request.update-spec': RequestRefSchema.extend({ specId: z.string().min(1), spec: SpecDraftSchema }),
  'request.accept': RequestRefSchema.extend({ specIds: z.array(z.string().min(1)).min(1) }),
  'issue.validate-spec': IssueRefSchema,
  'issue.start': IssueRefSchema,
  'issue.pause': IssueRefSchema,
  'issue.resume': IssueRefSchema,
  'issue.abandon': IssueRefSchema.extend({ reason: z.string().trim().min(1) }),
  'issue.rewrite-check': IssueRefSchema.extend({ path: z.string().min(1), instruction: z.string().min(1) }),
  'run.stop': RunRefSchema,
  'run.resume': RunRefSchema,
  'run.answer': RunRefSchema.extend({ questionId: z.string().min(1), answer: z.string().min(1) }),
  'pr.merge': z.object({ number: IssueNumberSchema, expectedHeadSha: z.string().min(1) }),
  'pr.feedback': z.object({ number: IssueNumberSchema, author: z.string().min(1), body: z.string().min(1) }),
  'deployment.redeploy': z.object({ environment: z.enum(['dev', 'prep']), confirmVersion: z.string().trim().min(1) }),
  'release.cut': ReleaseRefSchema,
  'release.evaluate': ReleaseRefSchema,
  'audit.publish-issue': AuditRefSchema,
  'audit.resolve': AuditRefSchema.extend({ note: z.string().min(1) }),
  'settings.update-role': z.object({
    role: z.enum(AGENT_ROLES),
    model: z.string().min(1),
    effort: z.enum(EFFORT_LEVELS),
    maxBudgetUsd: AmountSchema,
    maxTurns: CountSchema,
  }),
  'settings.update-limits': z.object({
    concurrencyCeiling: CountSchema,
    freeMemoryThresholdPercent: PercentSchema,
    pauseAbovePressure: z.enum(MEMORY_PRESSURES),
  }),
  'settings.test-tool': z.object({ tool: z.enum(TOOL_NAMES) }),
  'costs.update-caps': CostCapsSchema,
  'scheduler.pause': z.object({}),
  'scheduler.resume': z.object({}),
} as const;

export type CommandName = keyof typeof COMMAND_BODY_SCHEMAS;
export type CommandBody<N extends CommandName> = z.infer<(typeof COMMAND_BODY_SCHEMAS)[N]>;

export const COMMAND_NAMES = Object.freeze(Object.keys(COMMAND_BODY_SCHEMAS));

export const CommandAcceptedSchema = z.object({ sequence: CountSchema });
export type CommandAccepted = z.infer<typeof CommandAcceptedSchema>;

export const CommandRejectedSchema = z.object({ error: z.string() });
export type CommandRejected = z.infer<typeof CommandRejectedSchema>;
