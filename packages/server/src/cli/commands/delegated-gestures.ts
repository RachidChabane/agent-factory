import {
  AutonomyGate,
  authoriseGesture,
  describeGestureMade,
  NOTICES,
  type Authorisation,
  type AutonomyGateSettings,
  type Delegation,
  type GestureTarget,
} from '@agent-factory/application';
import type { DelegableGesture, OperatorOnlyGesture } from '@agent-factory/domain';
import type { ProjectConfig } from '../../config/agent-factory-config.ts';
import type { CliContext } from '../cli-context.ts';
import type { ProjectSession } from './project-session.ts';

function settingsOf(project: ProjectConfig): AutonomyGateSettings {
  return { project: project.id, policy: project.autonomy };
}

/**
 * Lets the delegate make a gesture that needs nothing but the policy, before anything else is read or written.
 * Null when the operator makes the gesture themselves. Throws the refusal, which names what the policy lacks.
 */
export function authorisedDelegate(project: ProjectConfig, delegation: Delegation | null, gesture: Exclude<DelegableGesture, 'merge'>): Authorisation | null {
  return delegation === null ? null : authoriseGesture(settingsOf(project), delegation, { gesture });
}

/**
 * Refuses the delegate who asks for a gesture no policy delegates, before anything else is read or written.
 * Nothing happens when the operator makes the gesture themselves.
 */
export function refuseDelegation(project: ProjectConfig, delegation: Delegation | null, gesture: OperatorOnlyGesture): void {
  if (delegation !== null) authoriseGesture(settingsOf(project), delegation, { gesture });
}

/** The gate of an open project, for the gestures that need the journal and for recording the ones that were made. */
export function gateOf(session: ProjectSession): AutonomyGate {
  return new AutonomyGate(session.project.dependencies.events, settingsOf(session.project.config));
}

/** Records the gesture the delegate made, tells the operator, and says on the output what was recorded. */
export async function recordDelegation(
  session: ProjectSession,
  context: CliContext,
  delegation: Delegation | null,
  authorisation: Authorisation | null,
  target: GestureTarget,
): Promise<void> {
  if (delegation === null || authorisation === null) return;
  const decision = await gateOf(session).record(delegation, authorisation, target);
  await session.project.notifications.send(NOTICES.gestureDelegated(decision));
  context.output.line(`Recorded: ${describeGestureMade(decision)}, allowed by ${decision.rule}; reason: ${decision.reason}`);
}
