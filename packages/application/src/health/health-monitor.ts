import type { Clock, EventStore } from '../ports.ts';
import type { EnvironmentHealth } from '../release/health-probe.ts';
import { HEALTH_SAMPLED_EVENT, healthSubject, type HealthSampledPayload } from './health-events.ts';

export interface HealthMonitorDependencies {
  readonly events: EventStore;
  readonly clock: Clock;
}

export interface HealthMonitorSettings {
  /** The environments that declare health checks. */
  readonly environments: readonly EnvironmentHealth[];
  readonly intervalMs: number;
}

export class UnknownHealthEnvironmentError extends Error {
  constructor(environment: string, known: readonly string[]) {
    super(`${environment} has no health check; ${known.length === 0 ? 'the project declares none' : `checks exist for ${known.join(', ')}`}`);
    this.name = 'UnknownHealthEnvironmentError';
  }
}

/** Samples the health checks of a project's environments on a schedule and on demand, one event per check. */
export class HealthMonitor {
  private readonly dependencies: HealthMonitorDependencies;
  private readonly settings: HealthMonitorSettings;
  private lastSampledAt: number | null = null;

  constructor(dependencies: HealthMonitorDependencies, settings: HealthMonitorSettings) {
    this.dependencies = dependencies;
    this.settings = settings;
  }

  /** Samples every environment when the interval has passed since the last sample. Returns the number of samples. */
  async sampleIfDue(): Promise<number> {
    const now = this.dependencies.clock.now().getTime();
    if (this.lastSampledAt !== null && now - this.lastSampledAt < this.settings.intervalMs) return 0;
    this.lastSampledAt = now;
    const counts = await Promise.all(this.settings.environments.map((environment) => this.sample(environment)));
    return counts.reduce((sum, count) => sum + count, 0);
  }

  async sampleEnvironment(name: string): Promise<number> {
    const environment = this.settings.environments.find((candidate) => candidate.environment === name);
    if (environment === undefined) {
      throw new UnknownHealthEnvironmentError(
        name,
        this.settings.environments.map((candidate) => candidate.environment),
      );
    }
    return this.sample(environment);
  }

  private async sample({ environment, probe }: EnvironmentHealth): Promise<number> {
    const results = await probe.check();
    for (const result of results) {
      const payload: HealthSampledPayload = {
        environment,
        check: result.name,
        url: result.url,
        ok: result.passed,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        detail: result.detail,
      };
      await this.dependencies.events.append(HEALTH_SAMPLED_EVENT, healthSubject(environment), payload);
    }
    return results.length;
  }
}
