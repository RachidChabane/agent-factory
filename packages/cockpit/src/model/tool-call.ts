import { z } from 'zod';

const ToolInputHintsSchema = z
  .object({
    command: z.string(),
    file_path: z.string(),
    path: z.string(),
    pattern: z.string(),
    description: z.string(),
    subagent_type: z.string(),
    url: z.string(),
    query: z.string(),
    prompt: z.string(),
  })
  .partial();

export interface ToolInputHints {
  readonly primary: string | null;
  readonly subagentType: string | null;
}

const PRIMARY_HINT_ORDER = ['command', 'file_path', 'path', 'pattern', 'description', 'url', 'query', 'prompt'] as const;
const SUMMARY_MAX_LENGTH = 160;

export function toolInputHints(input: unknown): ToolInputHints {
  const parsed = ToolInputHintsSchema.safeParse(input);
  if (!parsed.success) return { primary: null, subagentType: null };
  const hints = parsed.data;
  const primary = PRIMARY_HINT_ORDER.map((key) => hints[key]).find((value) => value !== undefined && value.length > 0);
  return { primary: primary ?? null, subagentType: hints.subagent_type ?? null };
}

export function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

const CODE_FENCE = '```';

export function firstProseLine(text: string): string {
  return text.trimStart().startsWith(CODE_FENCE) ? '' : firstLine(text);
}

export function firstLine(text: string): string {
  const line = text
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);
  return line ?? '';
}

export function toolCallSummary(toolName: string, input: unknown): string {
  const { primary } = toolInputHints(input);
  return primary === null ? toolName : `${toolName} · ${truncate(firstLine(primary), SUMMARY_MAX_LENGTH)}`;
}

export function formatToolInput(input: unknown): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input, null, 2) ?? '';
  } catch {
    return String(input);
  }
}
