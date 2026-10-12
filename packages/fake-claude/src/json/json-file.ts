import { readFile } from 'node:fs/promises';
import { errorMessage, hasErrorCode, invalidInvocation, type FakeClaudeError } from '../errors.ts';
import { DocumentError } from './json-reader.ts';

const MISSING_FILE = 'ENOENT';

export async function readJsonFile(file: string, label: string): Promise<unknown> {
  return parseJsonText(await readTextFile(file, label), file, label);
}

export function parseJsonText(text: string, source: string, label: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw invalidInvocation(`invalid ${label} ${source}: not valid JSON (${errorMessage(error)})`);
  }
}

export function validateDocument<T>(label: string, source: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    throw error instanceof DocumentError ? invalidDocument(label, source, error) : error;
  }
}

function invalidDocument(label: string, source: string, error: DocumentError): FakeClaudeError {
  return invalidInvocation(`invalid ${label} ${source}: ${error.message}`);
}

async function readTextFile(file: string, label: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    const reason = hasErrorCode(error, MISSING_FILE) ? 'does not exist' : `cannot be read (${errorMessage(error)})`;
    throw invalidInvocation(`${label} ${file} ${reason}`);
  }
}

