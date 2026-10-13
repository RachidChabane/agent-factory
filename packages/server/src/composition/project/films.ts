import {
  FilmBodies,
  FilmMergeGuard,
  FilmQueue,
  filmPresentationOf,
  LoggedFilmToolWait,
  type FilmPresentation,
  type FilmSettings,
  type PipelineDependencies,
  type PipelineSettings,
} from '@agent-factory/application';
import type { ProjectConfig } from '../../config/agent-factory-config.ts';
import type { InstallationContext } from '../installation/installation-context.ts';

/** What a project that films has besides its use cases: the film command, and the objects that keep the queue, the bodies and the merge in line. */
export interface ProjectFilms {
  readonly settings: FilmSettings;
  readonly presentation: FilmPresentation;
  readonly bodies: FilmBodies;
  readonly queue: FilmQueue;
  readonly guard: FilmMergeGuard;
}

/** Null when the project declares no film command. */
export function openProjectFilms(
  installation: InstallationContext,
  config: ProjectConfig,
  settings: PipelineSettings,
  dependencies: PipelineDependencies,
  cockpitUrl: string,
): ProjectFilms | null {
  const film = config.evidence.films;
  const ledger = installation.filmLedger;
  if (film === null || ledger === null) return null;
  const presentation = filmPresentationOf(film, cockpitUrl);
  const bodies = new FilmBodies(dependencies, { projectId: config.id, fileLinks: settings.fileLinks, presentation }, ledger);
  return { settings: film, presentation, bodies, queue: new FilmQueue(dependencies, bodies), guard: new FilmMergeGuard(ledger, config.id, presentation, new LoggedFilmToolWait(dependencies.events, film.tools)) };
}
