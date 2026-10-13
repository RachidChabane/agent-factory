import type { DelegableGesture } from '@agent-factory/domain';
import type { GestureMadePayload } from './autonomy-events.ts';

type Sentence = (actor: string, number: number) => string;

const SENTENCES: Readonly<Record<DelegableGesture, Sentence>> = {
  'validate-spec': (actor, number) => `${actor} validated the spec of issue #${number}`,
  'answer-decision': (actor, number) => `${actor} answered the decision of issue #${number}`,
  resume: (actor, number) => `${actor} resumed issue #${number}`,
  merge: (actor, number) => `${actor} merged pull request #${number}`,
};

/** What the delegate did, in one line. */
export function describeGestureMade(decision: Pick<GestureMadePayload, 'actor' | 'gesture' | 'target'>): string {
  return SENTENCES[decision.gesture](decision.actor, decision.target.number);
}
