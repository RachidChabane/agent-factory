import { filmLabel } from '@agent-factory/domain';
import { ISSUE_NUMBER, issueRecord, PipelineScenario, SCENARIO_START } from '../../pipeline/testing/pipeline-scenario.ts';
import type { SteppingClock } from '../../runs/test-support.ts';
import { FilmBehaviour, type FilmBehaviourSettings } from '../film-behaviour.ts';
import { FakeFilmRecorder, FakeRunActivity, FakeVideoTranscoder, filmServices, REPLAY_FILE, type FilmServices } from './film-fakes.ts';

export const STORE_ROOT = `/factory/evidence/issue-${ISSUE_NUMBER}`;

/** A scenario whose issue reached an open pull request, with the collaborators that film it. */
export interface Film {
  readonly scenario: PipelineScenario;
  readonly recorder: FakeFilmRecorder;
  readonly transcoder: FakeVideoTranscoder;
  readonly activity: FakeRunActivity;
  readonly behaviour: FilmBehaviour;
  readonly services: FilmServices;
  readonly clock: SteppingClock;
  readonly head: string;
}

export function behaviourOf(
  scenario: PipelineScenario,
  collaborators: Pick<Film, 'recorder' | 'transcoder' | 'activity' | 'services'>,
  replayFile: string | null = REPLAY_FILE,
): FilmBehaviour {
  const settings: FilmBehaviourSettings = {
    fileLinks: scenario.settings.fileLinks,
    evidenceCacheDirectory: scenario.settings.evidenceCacheDirectory,
    resources: scenario.settings.resources,
    replayFile,
  };
  const { recorder, transcoder, activity, services } = collaborators;
  return new FilmBehaviour({ ...scenario.dependencies(), recorder, transcoder, activity, queue: services.queue, bodies: services.bodies }, settings);
}

export async function openPullRequest(declaredFilms: readonly string[] = []): Promise<Film> {
  const scenario = new PipelineScenario();
  const { clock } = scenario;
  clock.set(SCENARIO_START);
  const services = filmServices(scenario);
  if (declaredFilms.length > 0) {
    scenario.github.issues.set(ISSUE_NUMBER, issueRecord({ labels: ['type:ui', 'spec:validated', ...declaredFilms.map(filmLabel)] }));
  }
  const outcome = await scenario.pipeline({ films: services.bodies }).runIssue(ISSUE_NUMBER);
  if (outcome.kind !== 'pr-open') throw new Error(`expected an open pull request, got ${outcome.kind}`);
  const recorder = new FakeFilmRecorder(scenario.workspace, STORE_ROOT);
  const transcoder = new FakeVideoTranscoder(scenario.workspace, STORE_ROOT);
  const activity = new FakeRunActivity();
  const collaborators = { recorder, transcoder, activity, services };
  return { scenario, ...collaborators, behaviour: behaviourOf(scenario, collaborators), clock, head: outcome.pullRequest.headSha };
}
