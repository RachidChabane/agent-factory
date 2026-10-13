import type { FilmRunningStage, RestartHazard } from '@agent-factory/application';
import { ageText } from './time-text.ts';

const DETAIL_INDENT = '  ';

const FILM_STAGE_TEXT: Readonly<Record<FilmRunningStage, string>> = {
  'recording-base': 'recording the base',
  'recording-head': 'recording the head',
  committing: 'committing the recordings',
};

function hazardLine(hazard: RestartHazard, now: Date): string {
  switch (hazard.kind) {
    case 'agent-run':
      return `agent run (${hazard.role}) for ${hazard.project ?? 'the installation'} ${hazard.subject}, started ${ageText(hazard.startedAt, now)}`;
    case 'film-recording':
      return `film recording: ${hazard.scenario} for ${hazard.project}#${hazard.issueNumber}${hazard.stage === null ? '' : ` (${FILM_STAGE_TEXT[hazard.stage]})`}`;
    case 'deterministic-stage':
      return `issue in a stage the factory runs by itself: ${hazard.project}#${hazard.issueNumber} is ${hazard.state}`;
  }
}

/**
 * Whether a restart would cut nothing short: a stopped factory has no work in flight, whatever its log still shows of the
 * run it died in; a running one is calm when no agent run, film recording or stage of its own is going on.
 */
export function renderCalm(factoryRunning: boolean, hazards: readonly RestartHazard[], now: Date): readonly string[] {
  if (!factoryRunning) return ['Calm: yes (the factory is not running)'];
  if (hazards.length === 0) return ['Calm: yes'];
  return ['Calm: no', ...hazards.map((hazard) => `${DETAIL_INDENT}${hazardLine(hazard, now)}`)];
}
