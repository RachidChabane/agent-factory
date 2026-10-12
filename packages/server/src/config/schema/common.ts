import { z } from 'zod';
import { EFFORT_LEVELS } from '@agent-factory/domain';

export const CONFIG_VERSION = 1;
export const NONE = 'none';
export const MIN_NICENESS = 0;
export const MAX_NICENESS = 19;
export const MAX_PORT = 65_535;
export const DEFAULT_NICENESS = 10;

export const ENVIRONMENT_VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const IDENTIFIER = /^[a-z][a-z0-9-]*$/;
export const ACCOUNT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Variable names that look like credentials never reach check commands or agent runs. */
export const CREDENTIAL_VARIABLE_PATTERN = /^(GH|GITHUB|GITLAB|AWS|AZURE|GOOGLE|GCLOUD|VAULT|DD|DATADOG|ANTHROPIC|OPENAI|NPM|SLACK)_|TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY/i;

export const NonEmptyString = z.string().trim().min(1);
export const PathString = NonEmptyString;
export const Identifier = z.string().regex(IDENTIFIER, 'must be lowercase letters, digits and dashes, starting with a letter');
export const PositiveMinutes = z.number().positive();
export const PositiveSeconds = z.number().positive();
export const Niceness = z.number().int().min(MIN_NICENESS).max(MAX_NICENESS);
export const Ratio = z.number().positive().max(1);
export const Effort = z.enum(EFFORT_LEVELS);

export const EnvironmentVariableName = z.string().regex(ENVIRONMENT_VARIABLE_NAME, 'must be a valid environment variable name');

/** A secret is never written in the file: it names the environment variable that holds it. */
export const SecretReferenceSchema = z.strictObject({ fromEnvironment: EnvironmentVariableName });
export type SecretReference = z.infer<typeof SecretReferenceSchema>;

export const NoneOrPositive = z.union([z.literal(NONE), z.number().positive()]);

export const NamedCommandSchema = z.strictObject({
  name: NonEmptyString,
  run: NonEmptyString,
  /** Why the command needs the network; without it the command runs with no network at all. */
  network: NonEmptyString.optional(),
});
export type RawNamedCommand = z.infer<typeof NamedCommandSchema>;

export const CheckVariableName = EnvironmentVariableName.refine((name) => !CREDENTIAL_VARIABLE_PATTERN.test(name), {
  message: 'looks like a credential; credential variables never reach check commands or agent runs',
});

export const EnvironmentSetSchema = z.record(z.string(), z.string()).superRefine((set, context) => {
  for (const name of Object.keys(set)) {
    const result = CheckVariableName.safeParse(name);
    if (!result.success) context.addIssue({ code: 'custom', path: [name], message: result.error.issues[0]?.message ?? 'is not a valid variable name' });
  }
});

export const EscalationSchema = z.strictObject({ model: NonEmptyString, effort: Effort });

export const RoleSchema = z.strictObject({
  model: NonEmptyString,
  effort: Effort,
  maxBudgetUsd: z.number().positive(),
  maxTurns: z.number().int().positive(),
  timeoutMinutes: PositiveMinutes,
  escalation: EscalationSchema.optional(),
});
export type RawRole = z.infer<typeof RoleSchema>;

export const RoleOverrideSchema = RoleSchema.partial();
export type RawRoleOverride = z.infer<typeof RoleOverrideSchema>;

export function uniqueBy<T>(items: readonly T[], key: (item: T) => string): readonly string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}
