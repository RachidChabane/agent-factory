import { ROOT_PATH, childOf, type JsonPath } from '../json/json-path.ts';
import {
  DocumentError,
  fieldsOf,
  mapList,
  readList,
  readNonEmptyString,
  readNumber,
  readOneOf,
  readOptional,
  readRecord,
  readRelativePath,
  readString,
  rejectUnknownFields,
  type JsonRecord,
  type NumberBounds,
} from '../json/json-reader.ts';
import {
  DEFAULT_ACCOUNT,
  DEFAULT_ROLE_SIGNATURES,
  DEFAULT_SCOPED_RESET_HOURS,
  DEFAULT_USAGE,
  FAKE_ROLES,
  STEP_KINDS,
  type AccountSettings,
  type Attempt,
  type FakeRole,
  type NonEmptyList,
  type RoleSignatures,
  type Scenario,
  type ScenarioEntry,
  type ScopedUsageWindow,
  type Script,
  type Step,
  type StepKind,
  type UsageSettings,
  type UsageWindow,
  type WriteStep,
} from './scenario.ts';

const SCENARIO_FIELDS = ['signatures', 'account', 'usage', 'entries', 'fallback'] as const;
const ACCOUNT_FIELDS = ['email', 'organization', 'subscriptionType'] as const;
const USAGE_FIELDS = ['session', 'weeklyAll', 'weeklyScoped'] as const;
const USAGE_WINDOW_FIELDS = ['percent', 'resetsInHours'] as const;
const SCOPED_WINDOW_FIELDS = ['model', 'percent', 'resetsInHours'] as const;
const ENTRY_FIELDS = ['role', 'when', 'attempts'] as const;
const SCRIPT_FIELDS = ['attempts'] as const;
const ATTEMPT_FIELDS = ['steps', 'final'] as const;
const WRITE_FIELDS = ['path', 'content'] as const;

const PERCENT_BOUNDS: NumberBounds = { min: 0, max: 100 };
const HOURS_PER_YEAR = 8_760;
const HOURS_BOUNDS: NumberBounds = { min: 0, max: HOURS_PER_YEAR };

export function parseScenario(document: unknown): Scenario {
  const root = readRecord(document, ROOT_PATH);
  rejectUnknownFields(root, SCENARIO_FIELDS, ROOT_PATH);
  const at = fieldsOf(root, ROOT_PATH);
  return {
    signatures: readOptional(at('signatures'), readSignatures) ?? DEFAULT_ROLE_SIGNATURES,
    account: readOptional(at('account'), readAccount) ?? DEFAULT_ACCOUNT,
    usage: readOptional(at('usage'), readUsage) ?? DEFAULT_USAGE,
    entries: readOptional(at('entries'), readEntries) ?? [],
    fallback: readOptional(at('fallback'), readFallback) ?? {},
  };
}

function readAccount(value: unknown, path: JsonPath): AccountSettings {
  const record = readRecord(value, path);
  rejectUnknownFields(record, ACCOUNT_FIELDS, path);
  const at = fieldsOf(record, path);
  return {
    email: readOptional(at('email'), readNonEmptyString) ?? DEFAULT_ACCOUNT.email,
    organization: readOptional(at('organization'), readNonEmptyString) ?? DEFAULT_ACCOUNT.organization,
    subscriptionType: readOptional(at('subscriptionType'), readNonEmptyString) ?? DEFAULT_ACCOUNT.subscriptionType,
  };
}

function readSignatures(value: unknown, path: JsonPath): RoleSignatures {
  const record = readRecord(value, path);
  rejectUnknownFields(record, FAKE_ROLES, path);
  const signatures: RoleSignatures = {
    'acceptance-author': signatureOf(record, path, 'acceptance-author'),
    implementer: signatureOf(record, path, 'implementer'),
    reviewer: signatureOf(record, path, 'reviewer'),
    auditor: signatureOf(record, path, 'auditor'),
    challenger: signatureOf(record, path, 'challenger'),
  };
  assertDistinctSignatures(signatures, path);
  return signatures;
}

function signatureOf(record: JsonRecord, path: JsonPath, role: FakeRole): string {
  return readOptional(fieldsOf(record, path)(role), readNonEmptyString) ?? DEFAULT_ROLE_SIGNATURES[role];
}

function assertDistinctSignatures(signatures: RoleSignatures, path: JsonPath): void {
  const owners = new Map<string, FakeRole>();
  for (const role of FAKE_ROLES) {
    const owner = owners.get(signatures[role]);
    if (owner !== undefined) {
      throw new DocumentError(path, `must give "${owner}" and "${role}" different signatures`);
    }
    owners.set(signatures[role], role);
  }
}

function readUsage(value: unknown, path: JsonPath): UsageSettings {
  const record = readRecord(value, path);
  rejectUnknownFields(record, USAGE_FIELDS, path);
  const at = fieldsOf(record, path);
  return {
    session: readOptional(at('session'), usageWindowReader(DEFAULT_USAGE.session)) ?? DEFAULT_USAGE.session,
    weeklyAll: readOptional(at('weeklyAll'), usageWindowReader(DEFAULT_USAGE.weeklyAll)) ?? DEFAULT_USAGE.weeklyAll,
    weeklyScoped: readOptional(at('weeklyScoped'), readScopedWindows) ?? DEFAULT_USAGE.weeklyScoped,
  };
}

function usageWindowReader(defaults: UsageWindow): (value: unknown, path: JsonPath) => UsageWindow {
  return (value, path) => {
    const record = readRecord(value, path);
    rejectUnknownFields(record, USAGE_WINDOW_FIELDS, path);
    const at = fieldsOf(record, path);
    return {
      percent: readOptional(at('percent'), numberReader(PERCENT_BOUNDS)) ?? defaults.percent,
      resetsInHours: readOptional(at('resetsInHours'), numberReader(HOURS_BOUNDS)) ?? defaults.resetsInHours,
    };
  };
}

function numberReader(bounds: NumberBounds): (value: unknown, path: JsonPath) => number {
  return (value, path) => readNumber(value, path, bounds);
}

function readScopedWindows(value: unknown, path: JsonPath): readonly ScopedUsageWindow[] {
  return mapList(readList(value, path), path, readScopedWindow);
}

function readScopedWindow(value: unknown, path: JsonPath): ScopedUsageWindow {
  const record = readRecord(value, path);
  rejectUnknownFields(record, SCOPED_WINDOW_FIELDS, path);
  const at = fieldsOf(record, path);
  return {
    model: readNonEmptyString(...at('model')),
    percent: readNumber(...at('percent'), PERCENT_BOUNDS),
    resetsInHours: readOptional(at('resetsInHours'), numberReader(HOURS_BOUNDS)) ?? DEFAULT_SCOPED_RESET_HOURS,
  };
}

function readEntries(value: unknown, path: JsonPath): readonly ScenarioEntry[] {
  return mapList(readList(value, path), path, readEntry);
}

function readEntry(value: unknown, path: JsonPath): ScenarioEntry {
  const record = readRecord(value, path);
  rejectUnknownFields(record, ENTRY_FIELDS, path);
  const at = fieldsOf(record, path);
  return {
    role: readOneOf(...at('role'), FAKE_ROLES),
    when: readNonEmptyString(...at('when')),
    attempts: readAttempts(...at('attempts')),
  };
}

function readFallback(value: unknown, path: JsonPath): Readonly<Partial<Record<FakeRole, Script>>> {
  const record = readRecord(value, path);
  rejectUnknownFields(record, FAKE_ROLES, path);
  const at = fieldsOf(record, path);
  const fallback: Partial<Record<FakeRole, Script>> = {};
  for (const role of FAKE_ROLES) {
    const script = readOptional(at(role), readScript);
    if (script !== undefined) {
      fallback[role] = script;
    }
  }
  return fallback;
}

function readScript(value: unknown, path: JsonPath): Script {
  const record = readRecord(value, path);
  rejectUnknownFields(record, SCRIPT_FIELDS, path);
  return { attempts: readAttempts(...fieldsOf(record, path)('attempts')) };
}

function readAttempts(value: unknown, path: JsonPath): NonEmptyList<Attempt> {
  const [first, ...rest] = mapList(readList(value, path), path, readAttempt);
  if (first === undefined) {
    throw new DocumentError(path, 'must contain at least one attempt');
  }
  return [first, ...rest];
}

function readAttempt(value: unknown, path: JsonPath): Attempt {
  const record = readRecord(value, path);
  rejectUnknownFields(record, ATTEMPT_FIELDS, path);
  const at = fieldsOf(record, path);
  return {
    steps: readOptional(at('steps'), readSteps) ?? [],
    final: readOptional(at('final'), readNonEmptyString) ?? null,
  };
}

function readSteps(value: unknown, path: JsonPath): readonly Step[] {
  return mapList(readList(value, path), path, readStep);
}

function readStep(value: unknown, path: JsonPath): Step {
  const record = readRecord(value, path);
  const kind = stepKindOf(record, path);
  const [body, bodyPath] = fieldsOf(record, path)(kind);
  switch (kind) {
    case 'write':
      return readWriteStep(body, bodyPath);
    case 'delete':
      return { kind, path: readRelativePath(body, bodyPath) };
    case 'say':
      return { kind, text: readNonEmptyString(body, bodyPath) };
  }
}

function stepKindOf(record: JsonRecord, path: JsonPath): StepKind {
  const [field, ...others] = Object.keys(record);
  const expected = STEP_KINDS.map((kind) => `"${kind}"`).join(', ');
  if (field === undefined || others.length > 0) {
    throw new DocumentError(path, `must have exactly one of ${expected}`);
  }
  const kind = STEP_KINDS.find((candidate) => candidate === field);
  if (kind === undefined) {
    throw new DocumentError(childOf(path, field), `is not a step (expected one of ${expected})`);
  }
  return kind;
}

function readWriteStep(value: unknown, path: JsonPath): WriteStep {
  const record = readRecord(value, path);
  rejectUnknownFields(record, WRITE_FIELDS, path);
  const at = fieldsOf(record, path);
  return { kind: 'write', path: readRelativePath(...at('path')), content: readString(...at('content')) };
}
