import type { z } from 'zod';

export type ParseOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const MAX_REPORTED_ISSUES = 3;

export function describeZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => (issue.path.length === 0 ? issue.message : `${issue.path.join('.')}: ${issue.message}`))
    .join('; ');
}

export function parseJsonMessage<T>(data: string, schema: z.ZodType<T>): ParseOutcome<T> {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return { ok: false, reason: 'message is not valid JSON' };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: describeZodError(parsed.error) };
}
