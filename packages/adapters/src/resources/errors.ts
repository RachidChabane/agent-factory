export class ResourceProbeError extends Error {
  constructor(what: string, detail: string) {
    super(`Could not read ${what}: ${detail}`);
    this.name = 'ResourceProbeError';
  }
}
