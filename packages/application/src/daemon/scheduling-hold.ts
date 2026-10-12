/** What the installation lets a project start at one tick. */
export interface SchedulingHold {
  /** A film holds every slot of every project: nothing starts, not even a request challenge or an audit. */
  readonly slotsHeld: boolean;
}

export const SLOTS_FREE: SchedulingHold = { slotsHeld: false };
export const SLOTS_HELD: SchedulingHold = { slotsHeld: true };
