import { z } from 'zod';
import { AGENT_ROLES, EFFORT_LEVELS, MEMORY_PRESSURE_LEVELS, TOOL_STATUSES } from '@agent-factory/domain';

export const SETTINGS_SUBJECT = 'settings';
export const SETTINGS_CHANGED_EVENT = 'settings.changed';
export const CONFIGURATION_RELOADED_EVENT = 'settings.configuration-reloaded';
export const TOOL_CHECKED_EVENT = 'settings.tool-checked';

const DailyCapSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('none') }), z.object({ kind: z.literal('usd'), amount: z.number() })]);

export const SettingsChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('role'),
    project: z.string().nullable(),
    role: z.enum(AGENT_ROLES),
    model: z.string(),
    effort: z.enum(EFFORT_LEVELS),
    maxBudgetUsd: z.number(),
    maxTurns: z.number(),
  }),
  z.object({
    kind: z.literal('resources'),
    minimumFreeMemoryPercent: z.number(),
    pauseAbovePressure: z.enum(MEMORY_PRESSURE_LEVELS),
    maxConcurrentRuns: z.number(),
  }),
  z.object({ kind: z.literal('budget'), dailyCap: DailyCapSchema, perRunCapUsd: z.number().nullable() }),
  z.object({ kind: z.literal('concurrency'), project: z.string(), issues: z.number(), ceiling: z.number() }),
]);

export const SettingsChangedPayloadSchema = z.object({
  change: SettingsChangeSchema,
  operator: z.string().min(1),
  backupPath: z.string().min(1),
});
export type SettingsChangedPayload = z.infer<typeof SettingsChangedPayloadSchema>;

export const ConfigurationReloadedPayloadSchema = z.object({
  appliedThrough: z.number().int().nonnegative(),
  concurrency: z.number().int().positive(),
  /** The settings that changed in the file but only take effect after a restart. */
  restartRequired: z.array(z.string()),
});
export type ConfigurationReloadedPayload = z.infer<typeof ConfigurationReloadedPayloadSchema>;

export const ToolCheckedPayloadSchema = z.object({
  tool: z.string().min(1),
  status: z.enum(TOOL_STATUSES),
  version: z.string().nullable(),
  detail: z.string(),
  fixCommand: z.string().nullable(),
  operator: z.string().min(1),
});
export type ToolCheckedPayload = z.infer<typeof ToolCheckedPayloadSchema>;
