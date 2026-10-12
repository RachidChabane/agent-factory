export const FAKE_ROLES = ['acceptance-author', 'implementer', 'reviewer', 'auditor', 'challenger'] as const;
export type FakeRole = (typeof FAKE_ROLES)[number];

export type RoleSignatures = Readonly<Record<FakeRole, string>>;

export const DEFAULT_ROLE_SIGNATURES: RoleSignatures = {
  'acceptance-author': 'You write the acceptance checks',
  implementer: 'You implement one',
  reviewer: 'You review one change',
  auditor: 'You audit one change',
  challenger: 'You examine a product request',
};

export const STEP_KINDS = ['write', 'delete', 'say'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export interface WriteStep {
  readonly kind: 'write';
  readonly path: string;
  readonly content: string;
}

export interface DeleteStep {
  readonly kind: 'delete';
  readonly path: string;
}

export interface SayStep {
  readonly kind: 'say';
  readonly text: string;
}

export type Step = WriteStep | DeleteStep | SayStep;

export const DEFAULT_FINAL_TEXT = 'Done.';

export interface Attempt {
  readonly steps: readonly Step[];
  readonly final: string | null;
}

export type NonEmptyList<T> = readonly [T, ...T[]];

export interface Script {
  readonly attempts: NonEmptyList<Attempt>;
}

export interface ScenarioEntry extends Script {
  readonly role: FakeRole;
  readonly when: string;
}

export interface UsageWindow {
  readonly percent: number;
  readonly resetsInHours: number;
}

export interface ScopedUsageWindow extends UsageWindow {
  readonly model: string;
}

export interface UsageSettings {
  readonly session: UsageWindow;
  readonly weeklyAll: UsageWindow;
  readonly weeklyScoped: readonly ScopedUsageWindow[];
}

const DEFAULT_SESSION_PERCENT = 12;
const DEFAULT_SESSION_RESET_HOURS = 3;
const DEFAULT_WEEKLY_ALL_PERCENT = 34;
const DEFAULT_WEEKLY_RESET_HOURS = 80;
const DEFAULT_SCOPED_MODEL = 'Opus';
const DEFAULT_SCOPED_PERCENT = 8;

export const DEFAULT_SCOPED_RESET_HOURS = DEFAULT_WEEKLY_RESET_HOURS;

export const DEFAULT_USAGE: UsageSettings = {
  session: { percent: DEFAULT_SESSION_PERCENT, resetsInHours: DEFAULT_SESSION_RESET_HOURS },
  weeklyAll: { percent: DEFAULT_WEEKLY_ALL_PERCENT, resetsInHours: DEFAULT_WEEKLY_RESET_HOURS },
  weeklyScoped: [{ model: DEFAULT_SCOPED_MODEL, percent: DEFAULT_SCOPED_PERCENT, resetsInHours: DEFAULT_SCOPED_RESET_HOURS }],
};

/** The login `claude auth status` reports. */
export interface AccountSettings {
  readonly email: string;
  readonly organization: string;
  readonly subscriptionType: string;
}

export const DEFAULT_ACCOUNT: AccountSettings = { email: 'operator@example.com', organization: 'Example Org', subscriptionType: 'max' };

export interface Scenario {
  readonly signatures: RoleSignatures;
  readonly account: AccountSettings;
  readonly usage: UsageSettings;
  readonly entries: readonly ScenarioEntry[];
  readonly fallback: Readonly<Partial<Record<FakeRole, Script>>>;
}
