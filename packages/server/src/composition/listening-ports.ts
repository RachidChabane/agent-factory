import { COCKPIT_DEV_SERVER_PORT } from '@agent-factory/cockpit';

/** The ports the factory itself listens on, which confined commands may not reach. */
export function factoryPorts(serverPort: number): readonly number[] {
  return [serverPort, COCKPIT_DEV_SERVER_PORT];
}

export class ListeningPorts {
  private readonly bound = new Set<number>();

  constructor(initial: readonly number[]) {
    initial.forEach((port) => this.register(port));
  }

  register(port: number): void {
    if (port > 0) this.bound.add(port);
  }

  ports(): readonly number[] {
    return [...this.bound];
  }
}
