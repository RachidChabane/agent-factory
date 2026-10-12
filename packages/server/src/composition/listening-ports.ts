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
