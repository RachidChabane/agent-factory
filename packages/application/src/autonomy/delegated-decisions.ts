import type { FactoryEventRecord } from '../ports.ts';
import { GESTURE_MADE_EVENT, GestureMadePayloadSchema, type GestureMadePayload } from './autonomy-events.ts';

/** A gesture the delegate made, with when the factory recorded it. */
export interface DelegatedDecision extends GestureMadePayload {
  readonly sequence: number;
  readonly at: Date;
}

/** The gestures the delegate made, newest first. A record that does not parse is left out. */
export function delegatedDecisionsOf(records: readonly FactoryEventRecord[]): readonly DelegatedDecision[] {
  return records
    .filter((record) => record.type === GESTURE_MADE_EVENT)
    .flatMap((record) => {
      const parsed = GestureMadePayloadSchema.safeParse(record.payload);
      return parsed.success ? [{ ...parsed.data, sequence: record.sequence, at: record.occurredAt }] : [];
    })
    .toReversed();
}
