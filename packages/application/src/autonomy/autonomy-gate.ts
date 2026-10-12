import { decideGesture, gesturePhrase, issueSubject, type AutonomyPolicy, type DelegableGesture, type FilmFacts, type GestureRequest } from '@agent-factory/domain';
import { failedFilmScenarios, pendingFilmScenarios } from '../film/film-pending.ts';
import { issueOfPullRequest } from '../pipeline/merge-on-order.ts';
import { loadJournal, type PipelineJournal } from '../pipeline/pipeline-journal.ts';
import type { EventStore } from '../ports.ts';
import { GESTURE_MADE_EVENT, type GestureMadePayload, type GestureTargetKind } from './autonomy-events.ts';
import type { Delegation } from './delegation.ts';

/** The gesture a policy refused, with the actor, the project and what the policy lacks. */
export class GestureRefusedError extends Error {
  readonly actor: string;
  readonly gesture: DelegableGesture;
  readonly project: string;
  readonly missing: string;

  constructor(actor: string, gesture: DelegableGesture, project: string, missing: string) {
    super(`Refused: ${actor} may not ${gesturePhrase(gesture)} in project ${project}: ${missing}`);
    this.name = 'GestureRefusedError';
    this.actor = actor;
    this.gesture = gesture;
    this.project = project;
    this.missing = missing;
  }
}

/** A gesture the policy allowed, with the rule that allowed it. */
export interface Authorisation {
  readonly gesture: DelegableGesture;
  readonly rule: string;
}

/** What a gesture acted on, and the issue whose record it belongs to. */
export interface GestureTarget {
  readonly kind: GestureTargetKind;
  readonly number: number;
  readonly issueNumber: number;
}

export interface AutonomyGateSettings {
  readonly project: string;
  readonly policy: AutonomyPolicy;
}

/** The films of a pull request as the policy's conditions read them. */
export function filmFactsOf(journal: PipelineJournal): FilmFacts {
  return {
    declared: journal.spec?.films ?? [],
    recorded: journal.films.map((film) => film.scenario),
    failed: failedFilmScenarios(journal),
    pending: pendingFilmScenarios(journal),
  };
}

const NO_SPEC = 'the issue of the pull request has no recorded spec, so its type is unknown';

/**
 * Lets the delegate make a gesture of the operator's only when the project's policy delegates it, and
 * records each one it made. The check comes first: a refusal leaves everything as it was.
 */
export class AutonomyGate {
  private readonly events: EventStore;
  private readonly settings: AutonomyGateSettings;

  constructor(events: EventStore, settings: AutonomyGateSettings) {
    this.events = events;
    this.settings = settings;
  }

  /** The gestures that need no fact beyond the policy. */
  authorise(delegation: Delegation, gesture: Exclude<DelegableGesture, 'merge'>): Authorisation {
    return this.decide(delegation, { gesture });
  }

  /** The merge of a pull request, judged on its issue type and its films as the journal holds them now. */
  async authoriseMerge(delegation: Delegation, pullRequestNumber: number): Promise<Authorisation> {
    const issueNumber = await issueOfPullRequest(this.events, pullRequestNumber);
    const journal = await loadJournal(this.events, issueNumber);
    const issueType = journal.spec?.type;
    if (issueType === undefined) throw new GestureRefusedError(delegation.actor, 'merge', this.settings.project, NO_SPEC);
    return this.decide(delegation, { gesture: 'merge', facts: { issueType, films: filmFactsOf(journal) } });
  }

  /** Records a gesture the delegate made, once it succeeded. */
  async record(delegation: Delegation, authorisation: Authorisation, target: GestureTarget): Promise<GestureMadePayload> {
    const payload: GestureMadePayload = {
      actor: delegation.actor,
      gesture: authorisation.gesture,
      target: { kind: target.kind, number: target.number },
      issueNumber: target.issueNumber,
      reason: delegation.reason,
      rule: authorisation.rule,
    };
    await this.events.append(GESTURE_MADE_EVENT, issueSubject(target.issueNumber), payload);
    return payload;
  }

  private decide(delegation: Delegation, request: GestureRequest): Authorisation {
    const decision = decideGesture(this.settings.policy, delegation.actor, request);
    if (!decision.allowed) throw new GestureRefusedError(delegation.actor, request.gesture, this.settings.project, decision.missing);
    return { gesture: request.gesture, rule: decision.rule };
  }
}
