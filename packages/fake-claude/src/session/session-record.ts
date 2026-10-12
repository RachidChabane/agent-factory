import { ROOT_PATH, type JsonPath } from '../json/json-path.ts';
import {
  fieldsOf,
  readNonEmptyString,
  readNonNegativeInteger,
  readOneOf,
  readRecord,
  rejectUnknownFields,
  type Field,
} from '../json/json-reader.ts';
import { FAKE_ROLES, type FakeRole } from '../scenario/scenario.ts';
import { SCRIPT_SOURCES, type ScriptReference } from '../scenario/script-reference.ts';

export interface SessionRecord {
  readonly sessionId: string;
  readonly script: ScriptReference;
  readonly nextSlot: number;
  readonly runs: number;
}

const SESSION_FIELDS = ['sessionId', 'script', 'nextSlot', 'runs'] as const;
const SCRIPT_REFERENCE_FIELDS = ['source', 'index', 'role'] as const;
const JSON_INDENT = 2;

export function serializeSession(record: SessionRecord): string {
  return `${JSON.stringify(record, null, JSON_INDENT)}\n`;
}

export function parseSession(document: unknown): SessionRecord {
  const root = readRecord(document, ROOT_PATH);
  rejectUnknownFields(root, SESSION_FIELDS, ROOT_PATH);
  const at = fieldsOf(root, ROOT_PATH);
  return {
    sessionId: readNonEmptyString(...at('sessionId')),
    script: readScriptReference(...at('script')),
    nextSlot: readNonNegativeInteger(...at('nextSlot')),
    runs: readNonNegativeInteger(...at('runs')),
  };
}

function readScriptReference(value: unknown, path: JsonPath): ScriptReference {
  const record = readRecord(value, path);
  rejectUnknownFields(record, SCRIPT_REFERENCE_FIELDS, path);
  const at = fieldsOf(record, path);
  const source = readOneOf(...at('source'), SCRIPT_SOURCES);
  switch (source) {
    case 'entry':
      return { source, index: readNonNegativeInteger(...at('index')) };
    case 'fallback':
      return { source, role: readRole(at('role')) };
    case 'built-in':
      return { source, role: readOptionalRole(at('role')) };
  }
}

function readRole([value, path]: Field): FakeRole {
  return readOneOf(value, path, FAKE_ROLES);
}

function readOptionalRole(field: Field): FakeRole | null {
  return field[0] === null ? null : readRole(field);
}
