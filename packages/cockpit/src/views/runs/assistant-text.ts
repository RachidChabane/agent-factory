const CODE_FENCE = /```[a-z]*\n?([\s\S]*?)```/g;
const FENCE_BODY_GROUP = 1;

export interface TextSegment {
  readonly kind: 'prose' | 'code';
  readonly text: string;
}

/** Splits what the agent wrote into its prose and its fenced code blocks, dropping blank segments. */
export function splitCodeFences(text: string): readonly TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(CODE_FENCE)) {
    if (match.index > cursor) segments.push({ kind: 'prose', text: text.slice(cursor, match.index) });
    segments.push({ kind: 'code', text: (match[FENCE_BODY_GROUP] ?? '').trimEnd() });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ kind: 'prose', text: text.slice(cursor) });
  return segments.filter((segment) => segment.text.trim().length > 0).map((segment) => (segment.kind === 'prose' ? { ...segment, text: segment.text.trim() } : segment));
}
