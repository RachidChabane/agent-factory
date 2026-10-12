import { z } from 'zod';
import { ISSUE_TYPE_ID_PATTERN } from '@agent-factory/domain';

export const CHALLENGE_VERDICTS = ['keep', 'adjust', 'split', 'ask', 'decline'] as const;
export type ChallengeVerdict = (typeof CHALLENGE_VERDICTS)[number];

export const ChallengeAnswerSourceSchema = z.object({ label: z.string(), reference: z.string() });

export const ChallengeAnswerItemSchema = z.object({
  title: z.string().trim().min(1),
  verdict: z.enum(CHALLENGE_VERDICTS),
  currentState: z.string(),
  intent: z.string(),
  idea: z.string(),
  method: z.string(),
  reason: z.string(),
  question: z.string().nullable(),
  sources: z.array(ChallengeAnswerSourceSchema).default([]),
});
export type ChallengeAnswerItem = z.infer<typeof ChallengeAnswerItemSchema>;

export const ChallengeAnswerSpecSchema = z.object({
  title: z.string().trim().min(1),
  /** An issue type id; one the project does not declare becomes a problem of the proposed spec. */
  type: z.string().trim().regex(ISSUE_TYPE_ID_PATTERN, 'must be an issue type id: lowercase words joined by dashes'),
  items: z.array(z.number().int().positive()).default([]),
  need: z.string(),
  acceptanceCriteria: z.array(z.string()),
  outOfScope: z.array(z.string()),
  expectedProof: z.string(),
});
export type ChallengeAnswerSpec = z.infer<typeof ChallengeAnswerSpecSchema>;

export const ChallengeAnswerSchema = z
  .object({
    summary: z.string(),
    items: z.array(ChallengeAnswerItemSchema),
    specs: z.array(ChallengeAnswerSpecSchema),
    reply: z.string(),
  })
  .superRefine((answer, context) => {
    answer.specs.forEach((spec, specIndex) => {
      spec.items.forEach((itemNumber, position) => {
        if (itemNumber > answer.items.length) {
          context.addIssue({
            code: 'custom',
            path: ['specs', specIndex, 'items', position],
            message: `item ${itemNumber} does not exist`,
          });
        }
      });
    });
  });
export type ChallengeAnswer = z.infer<typeof ChallengeAnswerSchema>;

const JSON_FENCE_PATTERN = /```json\s*([\s\S]*?)```/g;
const FENCE_CAPTURE_GROUP = 1;

export const REASON_NO_CHALLENGE_JSON_BLOCK = 'the answer contains no fenced json block';

export type ChallengeAnswerParse =
  | { readonly ok: true; readonly answer: ChallengeAnswer }
  | { readonly ok: false; readonly reason: string };

export function parseChallengeAnswer(finalText: string): ChallengeAnswerParse {
  const blocks = [...finalText.matchAll(JSON_FENCE_PATTERN)];
  const last = blocks.at(-1)?.[FENCE_CAPTURE_GROUP];
  if (last === undefined) return { ok: false, reason: REASON_NO_CHALLENGE_JSON_BLOCK };
  let json: unknown;
  try {
    json = JSON.parse(last);
  } catch (error) {
    return { ok: false, reason: `the json block is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const parsed = ChallengeAnswerSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: `the json block does not match the challenge schema: ${parsed.error.message}` };
  return { ok: true, answer: parsed.data };
}
