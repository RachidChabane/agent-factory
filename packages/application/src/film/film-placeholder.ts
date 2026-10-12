import type { FilmForecastEntry } from '@agent-factory/domain';
import { COCKPIT_PATHS, cockpitLink } from '../notifications/cockpit-links.ts';
import type { FilmRunningStage } from '../pipeline/journal-events.ts';
import { inlineCode } from '../pipeline/markdown.ts';
import type { FilmOrderState } from '../pipeline/pipeline-journal.ts';
import { filmScenarioHeading } from './film-section.ts';
import type { FilmPresentation } from './film-settings.ts';
import { formatArrival } from './film-time.ts';

export const FILM_CLI_COMMAND = 'agent-factory film';
const PARAGRAPH = '\n\n';
const WHITESPACE = /\s+/g;
const SINGLE_SPACE = ' ';

const STAGE_SENTENCES: Readonly<Record<FilmRunningStage, string>> = {
  'recording-base': 'the base is being recorded now',
  'recording-head': 'the head is being recorded now',
  committing: 'the recordings are being committed now',
};

export interface FilmPlaceholderInput {
  readonly scenario: string;
  readonly pullRequestNumber: number | null;
  readonly stage: FilmRunningStage | null;
  readonly forecast: FilmForecastEntry | null;
  readonly presentation: FilmPresentation;
}

function filmCount(count: number): string {
  return count === 1 ? '1 film' : `${count} films`;
}

/** What the pull request body says of a film that has not landed: where it stands and when it is expected. */
export function renderFilmPlaceholder(input: FilmPlaceholderInput): string {
  const { presentation, forecast, stage } = input;
  const sentences = [
    `The videos and screenshots of this scenario are being recorded against the base and the head of this pull request${stage === null ? '' : ` (${STAGE_SENTENCES[stage]})`}.`,
    `They will replace this paragraph when ready${forecast === null ? '' : `, expected around ${formatArrival(new Date(forecast.arrivalAtMs), presentation.timeZone)}`}.`,
    ...(forecast !== null && forecast.filmsAhead > 0 ? [`The recording is queued behind ${filmCount(forecast.filmsAhead)}.`] : []),
    ...(presentation.cockpitUrl === null || input.pullRequestNumber === null
      ? []
      : [`[Follow it in the cockpit](${cockpitLink(presentation.cockpitUrl, COCKPIT_PATHS.pullRequest(input.pullRequestNumber))}).`]),
  ];
  return [filmScenarioHeading(input.scenario), sentences.join(SINGLE_SPACE)].join(PARAGRAPH);
}

/** The order again, by hand: the command a failed film is repeated with. */
export function filmCommandHint(projectId: string, issueNumber: number, scenario: string): string {
  return inlineCode(`${FILM_CLI_COMMAND} ${issueNumber} --scenario ${scenario} --project ${projectId}`);
}

export function renderFilmFailure(projectId: string, issueNumber: number, order: Pick<FilmOrderState, 'scenario' | 'reason'>): string {
  const reason = (order.reason ?? '').replace(WHITESPACE, SINGLE_SPACE).trim();
  return [
    filmScenarioHeading(order.scenario),
    `The recording of this scenario failed${reason === '' ? '' : `: ${reason}`}. Order it again with the Film button of the cockpit or with ${filmCommandHint(projectId, issueNumber, order.scenario)}.`,
  ].join(PARAGRAPH);
}
