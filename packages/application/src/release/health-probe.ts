export interface HealthCheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface HealthProbe {
  check(): Promise<readonly HealthCheckResult[]>;
}

export class FakeHealthProbe implements HealthProbe {
  private readonly results: readonly HealthCheckResult[];

  constructor(results: readonly HealthCheckResult[]) {
    this.results = results;
  }

  check(): Promise<readonly HealthCheckResult[]> {
    return Promise.resolve(this.results);
  }
}
