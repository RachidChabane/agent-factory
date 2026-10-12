export interface LifecycleDefinition<S extends string> {
  readonly name: string;
  readonly states: readonly S[];
  readonly initial: S;
  readonly transitions: Readonly<Record<S, readonly S[]>>;
}

export class InvalidTransitionError extends Error {
  readonly lifecycle: string;
  readonly from: string;
  readonly to: string;

  constructor(lifecycle: string, from: string, to: string) {
    super(`${lifecycle}: transition ${from} -> ${to} is not declared`);
    this.name = 'InvalidTransitionError';
    this.lifecycle = lifecycle;
    this.from = from;
    this.to = to;
  }
}

export interface Lifecycle<S extends string> extends LifecycleDefinition<S> {
  canTransition(from: S, to: S): boolean;
  assertTransition(from: S, to: S): void;
  nextStates(from: S): readonly S[];
  isTerminal(state: S): boolean;
}

export function defineLifecycle<S extends string>(definition: LifecycleDefinition<S>): Lifecycle<S> {
  const nextStates = (from: S): readonly S[] => definition.transitions[from];
  const canTransition = (from: S, to: S): boolean => nextStates(from).includes(to);
  return {
    ...definition,
    nextStates,
    canTransition,
    isTerminal: (state) => nextStates(state).length === 0,
    assertTransition: (from, to) => {
      if (!canTransition(from, to)) {
        throw new InvalidTransitionError(definition.name, from, to);
      }
    },
  };
}
