export interface HealthCheckResult {
  readonly name: string;
  readonly url: string;
  readonly passed: boolean;
  readonly statusCode: number | null;
  readonly latencyMs: number | null;
  readonly detail: string;
}

export interface HealthProbe {
  check(): Promise<readonly HealthCheckResult[]>;
}

/** The health checks of one environment of a project. */
export interface EnvironmentHealth {
  readonly environment: string;
  readonly probe: HealthProbe;
}

/** A health check result of one of the environments a release runs on before production. */
export interface ReleaseHealthResult extends HealthCheckResult {
  readonly environment: string;
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
