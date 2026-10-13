import { z } from 'zod';

/** How the operator is named in the words of a gesture they made themselves. */
export const OPERATOR_AUTHOR = 'the operator';

/** A gesture of the operator that the delegate makes instead, with the reason it gave for taking it. */
export interface Delegation {
  readonly actor: string;
  readonly reason: string;
}

/** What the events of a gesture hold about its delegate; the operator's own gestures hold none of it. */
export const DelegationFieldsSchema = {
  actor: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
};

export interface DelegationFields {
  readonly actor?: string;
  readonly reason?: string;
}

export function delegationFields(delegation: Delegation | null): DelegationFields {
  return delegation === null ? {} : { actor: delegation.actor, reason: delegation.reason };
}

/** Who made a gesture, for the words of a record: the operator, or the delegate. */
export function authorOf(delegation: Delegation | null): string {
  return delegation === null ? OPERATOR_AUTHOR : delegation.actor;
}
