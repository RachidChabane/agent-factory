import { COMMAND_NAMES, type CommandName } from '../../packages/cockpit/src/contract/index.ts';
import type { FactoryMode } from './factory.ts';

/**
 * Where each command of the contract is clicked: the mode of the factory and the spec file (under specs/)
 * whose test sends it. The coverage guard fails when a command is missing here or its spec does not send it.
 */
export interface CommandCoverage {
  readonly mode: FactoryMode;
  readonly spec: string;
}

export const COMMAND_COVERAGE: Readonly<Record<CommandName, CommandCoverage>> = {
  'request.create': { mode: 'rehearsal', spec: 'rehearsal/requests.spec.ts' },
  'request.challenge': { mode: 'rehearsal', spec: 'rehearsal/requests.spec.ts' },
  'request.decline': { mode: 'demo', spec: 'demo/requests.spec.ts' },
  'request.update-spec': { mode: 'rehearsal', spec: 'rehearsal/requests.spec.ts' },
  'request.accept': { mode: 'rehearsal', spec: 'rehearsal/requests.spec.ts' },
  'issue.validate-spec': { mode: 'demo', spec: 'demo/issues.spec.ts' },
  'issue.start': { mode: 'rehearsal', spec: 'rehearsal/issues.spec.ts' },
  'issue.pause': { mode: 'rehearsal', spec: 'rehearsal/runs.spec.ts' },
  'issue.resume': { mode: 'rehearsal', spec: 'rehearsal/runs.spec.ts' },
  'issue.abandon': { mode: 'rehearsal', spec: 'rehearsal/escalations.spec.ts' },
  'issue.rewrite-check': { mode: 'rehearsal', spec: 'rehearsal/escalations.spec.ts' },
  'run.stop': { mode: 'rehearsal', spec: 'rehearsal/runs.spec.ts' },
  'run.resume': { mode: 'rehearsal', spec: 'rehearsal/runs.spec.ts' },
  'run.answer': { mode: 'rehearsal', spec: 'rehearsal/escalations.spec.ts' },
  'pr.merge': { mode: 'demo', spec: 'demo/pull-requests.spec.ts' },
  'pr.feedback': { mode: 'demo', spec: 'demo/pull-requests.spec.ts' },
  'pr.film': { mode: 'demo', spec: 'demo/pull-requests.spec.ts' },
  'deployment.redeploy': { mode: 'rehearsal', spec: 'rehearsal/delivery.spec.ts' },
  'release.cut': { mode: 'rehearsal', spec: 'rehearsal/releases.spec.ts' },
  'release.evaluate': { mode: 'demo', spec: 'demo/releases.spec.ts' },
  'audit.request': { mode: 'demo', spec: 'demo/audits.spec.ts' },
  'audit.publish-issue': { mode: 'demo', spec: 'demo/audits.spec.ts' },
  'audit.resolve': { mode: 'demo', spec: 'demo/audits.spec.ts' },
  'scheduler.pause': { mode: 'demo', spec: 'demo/scheduler.spec.ts' },
  'scheduler.resume': { mode: 'demo', spec: 'demo/scheduler.spec.ts' },
  'factory.drain': { mode: 'rehearsal', spec: 'rehearsal/shutdown.spec.ts' },
  'usage.refresh': { mode: 'demo', spec: 'demo/usage.spec.ts' },
  'tools.check': { mode: 'demo', spec: 'demo/tools.spec.ts' },
  'tools.login': { mode: 'demo', spec: 'demo/tools.spec.ts' },
  'health.check': { mode: 'demo', spec: 'demo/delivery.spec.ts' },
  'settings.update-role': { mode: 'demo', spec: 'demo/settings.spec.ts' },
  'settings.update-resources': { mode: 'demo', spec: 'demo/settings.spec.ts' },
  'settings.update-budget': { mode: 'demo', spec: 'demo/settings.spec.ts' },
  'settings.update-concurrency': { mode: 'demo', spec: 'demo/settings.spec.ts' },
};

export function commandsNotCovered(): readonly string[] {
  return COMMAND_NAMES.filter((name) => !Object.hasOwn(COMMAND_COVERAGE, name));
}
