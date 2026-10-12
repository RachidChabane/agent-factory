import { z } from 'zod';
import { AGENT_ROLES, EFFORT_LEVELS, MEMORY_PRESSURE_LEVELS, TOOL_STATUSES } from '@agent-factory/domain';

export const SETTINGS_SUBJECT = 'settings';
export const SETTINGS_CHANGED_EVENT = 'settings.changed';
export const CONFIGURATION_RELOADED_EVENT = 'settings.configuration-reloaded';
/** Someone edited the configuration file by hand; the daemon reloads it as it does after a settings change. */
export const CONFIGURATION_EDITED_EVENT = 'settings.file-edited';
/** A reload refused the file, so the factory kept the settings it had. */
export const CONFIGURATION_RELOAD_FAILED_EVENT = 'settings.reload-failed';
/** The events after which the daemon reloads the configuration. */
export const CONFIGURATION_CHANGE_EVENTS: readonly string[] = [SETTINGS_CHANGED_EVENT, CONFIGURATION_EDITED_EVENT];
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

export const ConfigurationEditedPayloadSchema = z.object({ digest: z.string().min(1) });
export type ConfigurationEditedPayload = z.infer<typeof ConfigurationEditedPayloadSchema>;

export const ConfigurationReloadFailedPayloadSchema = z.object({
  /** The last change the failed reload tried to apply; the daemon tries again only after a newer one. */
  failedThrough: z.number().int().nonnegative(),
  reason: z.string(),
});
export type ConfigurationReloadFailedPayload = z.infer<typeof ConfigurationReloadFailedPayloadSchema>;

export const ToolCheckedPayloadSchema = z.object({
  tool: z.string().min(1),
  status: z.enum(TOOL_STATUSES),
  version: z.string().nullable(),
  detail: z.string(),
  fixCommand: z.string().nullable(),
  operator: z.string().min(1),
});
export type ToolCheckedPayload = z.infer<typeof ToolCheckedPayloadSchema>;
