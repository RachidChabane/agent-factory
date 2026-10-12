import { z } from 'zod';
import { DELEGABLE_GESTURES } from '@agent-factory/domain';

/** The delegate made a gesture of the operator's, and the project's policy allowed it. */
export const GESTURE_MADE_EVENT = 'autonomy.gesture-made';

export const GESTURE_TARGET_KINDS = ['issue', 'pull-request'] as const;
export type GestureTargetKind = (typeof GESTURE_TARGET_KINDS)[number];

export const GestureMadePayloadSchema = z.object({
  actor: z.string().min(1),
  gesture: z.enum(DELEGABLE_GESTURES),
  target: z.object({ kind: z.enum(GESTURE_TARGET_KINDS), number: z.number().int().positive() }),
  /** The issue whose record the gesture belongs to; the pull request's issue for a merge. */
  issueNumber: z.number().int().positive(),
  reason: z.string().min(1),
  /** The rule of the policy that allowed the gesture. */
  rule: z.string().min(1),
});
export type GestureMadePayload = z.infer<typeof GestureMadePayloadSchema>;
