import type { FakeRole } from './scenario.ts';

export const SCRIPT_SOURCES = ['entry', 'fallback', 'built-in'] as const;

export type ScriptReference =
  | { readonly source: 'entry'; readonly index: number }
  | { readonly source: 'fallback'; readonly role: FakeRole }
  | { readonly source: 'built-in'; readonly role: FakeRole | null };
