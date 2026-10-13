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
const VIOLATION_SEPARATOR = '; ';
const MAX_FOUND_CHARACTERS = 40;

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

/** The fields of a report, in the order their rules are told. */
const REPORT_FIELDS = ['status', 'reason', 'facts', 'keyFrames'] as const;
type ReportField = (typeof REPORT_FIELDS)[number];

/** What each field of a report must be, in the words a film command's author reads in the failure. */
const FIELD_RULES: Readonly<Record<ReportField, string>> = {
  status: `status must be ${FILM_STATUSES.join(' or ')}`,
  reason: 'reason must be a string, the reason a skipped scenario gives',
  facts: 'facts must be a list of { "label": text, "value": text, number or true/false }',
  keyFrames: 'keyFrames must be a list of paths relative to the output directory',
};

const NOT_AN_OBJECT = 'the report must be a JSON object with a status';

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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What a field holds, briefly, so that the author sees the difference from what it must be. */
function foundIn(value: unknown): string {
  if (value === undefined) return 'missing';
  if (value === null) return 'found null';
  if (Array.isArray(value)) return 'found a list';
  if (typeof value === 'string') return `found ${JSON.stringify(oneLine(value, MAX_FOUND_CHARACTERS))}`;
  if (typeof value === 'object') return 'found an object';
  return `found ${typeof value === 'number' ? 'a number' : 'a boolean'}`;
}

function isReportField(key: PropertyKey | undefined): key is ReportField {
  return typeof key === 'string' && REPORT_FIELDS.some((field) => field === key);
}

/** Every field of the report that breaks its rule, in the order of the rules, each with what it holds. */
function violationsOf(report: Readonly<Record<string, unknown>>, issues: z.ZodError['issues']): readonly string[] {
  const broken = new Set(issues.map((issue) => issue.path[0]).filter(isReportField));
  return REPORT_FIELDS.filter((field) => broken.has(field)).map((field) => `${FIELD_RULES[field]} (${foundIn(report[field])})`);
}

/** Reads a film report. A fact that is not a label and a scalar value is left out rather than failing the film. */
export function parseReport(text: string, file: string): ParsedReport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new ReportUnreadableError(file, error instanceof Error ? error.message : String(error));
  }
  if (!isRecord(json)) throw new ReportUnreadableError(file, `${NOT_AN_OBJECT} (${foundIn(json)})`);
  const parsed = ReportSchema.safeParse(json);
  if (!parsed.success) throw new ReportUnreadableError(file, violationsOf(json, parsed.error.issues).join(VIOLATION_SEPARATOR));
  const reason = parsed.data.reason === undefined ? '' : oneLine(parsed.data.reason, MAX_FACT_VALUE_CHARACTERS);
  return {
    status: parsed.data.status,
    reason: reason === '' ? null : reason,
    facts: factsOf(parsed.data.facts),
    keyFrames: keyFramesOf(parsed.data.keyFrames),
  };
}
