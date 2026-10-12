import { z } from 'zod';
import type { FilmFact } from '@agent-factory/application';
import {
  MAX_FACT_LABEL_CHARACTERS,
  MAX_FACT_VALUE_CHARACTERS,
  MAX_FACTS,
  MAX_KEY_FRAMES,
  TRUNCATION_MARK,
} from './constants.ts';

export const FILM_STATUSES = ['recorded', 'skipped'] as const;
const WHITESPACE = /\s+/g;
const SINGLE_SPACE = ' ';
const CURRENT_DIRECTORY_PREFIX = /^\.\//;

const FactSchema = z.looseObject({
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const ReportSchema = z.looseObject({
  status: z.enum(FILM_STATUSES),
  reason: z.string().optional(),
  facts: z.array(z.unknown()).optional(),
  keyFrames: z.array(z.unknown()).optional(),
});

export class ReportUnreadableError extends Error {
  constructor(file: string, detail: string) {
    super(`${file} is not a readable film report: ${detail}`);
    this.name = 'ReportUnreadableError';
  }
}

export interface ParsedReport {
  readonly status: (typeof FILM_STATUSES)[number];
  readonly reason: string | null;
  readonly facts: readonly FilmFact[];
  readonly keyFrames: readonly string[];
}

/** One line, as long as a line of the pull request body may be. */
function oneLine(text: string, limit: number): string {
  const line = text.replace(WHITESPACE, SINGLE_SPACE).trim();
  return line.length > limit ? `${line.slice(0, limit - TRUNCATION_MARK.length)}${TRUNCATION_MARK}` : line;
}

function factsOf(entries: readonly unknown[] | undefined): readonly FilmFact[] {
  const facts: FilmFact[] = [];
  for (const entry of entries ?? []) {
    const fact = FactSchema.safeParse(entry);
    if (!fact.success) continue;
    const label = oneLine(fact.data.label, MAX_FACT_LABEL_CHARACTERS);
    if (label === '') continue;
    facts.push({ label, value: oneLine(String(fact.data.value), MAX_FACT_VALUE_CHARACTERS) });
    if (facts.length === MAX_FACTS) break;
  }
  return facts;
}

function keyFramesOf(entries: readonly unknown[] | undefined): readonly string[] {
  const frames = (entries ?? []).flatMap((entry) => (typeof entry === 'string' && entry.trim() !== '' ? [entry.trim().replace(CURRENT_DIRECTORY_PREFIX, '')] : []));
  return [...new Set(frames)].slice(0, MAX_KEY_FRAMES);
}

/** Reads a film report. A fact that is not a label and a scalar value is left out rather than failing the film. */
export function parseReport(text: string, file: string): ParsedReport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new ReportUnreadableError(file, error instanceof Error ? error.message : String(error));
  }
  const parsed = ReportSchema.safeParse(json);
  if (!parsed.success) throw new ReportUnreadableError(file, `status must be ${FILM_STATUSES.join(' or ')}`);
  const reason = parsed.data.reason === undefined ? '' : oneLine(parsed.data.reason, MAX_FACT_VALUE_CHARACTERS);
  return {
    status: parsed.data.status,
    reason: reason === '' ? null : reason,
    facts: factsOf(parsed.data.facts),
    keyFrames: keyFramesOf(parsed.data.keyFrames),
  };
}
