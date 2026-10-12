import type { FilmPhaseView, FilmView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { shortSha } from '../../model/identifiers.ts';
import { Time } from '../../widgets/Time.tsx';

interface FilmPhaseProps {
  readonly scenario: string;
  readonly phase: FilmPhaseView;
  readonly title: string;
  readonly playerLabel: string;
}

function FilmPhase({ scenario, phase, title, playerLabel }: FilmPhaseProps) {
  const { t } = useI18n();
  return (
    <section className="film__phase" aria-label={title}>
      <h4 className="film__phase-title">
        {title} <span className="mono film__sha">{shortSha(phase.sha)}</span>
      </h4>
      <video className="film__video" controls preload="metadata" playsInline src={phase.videoUrl} aria-label={playerLabel} />
      {phase.screenshotUrls.map((url, position) => (
        <img key={url} className="film__screenshot" src={url} alt={t('pullRequests.films.screenshot', { phase: title, scenario, position: position + 1 })} loading="lazy" />
      ))}
      {phase.facts.length === 0 ? null : (
        <dl className="film__facts" aria-label={t('pullRequests.films.facts', { phase: title })}>
          {phase.facts.map((fact) => (
            <div key={fact.label} className="film__fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** A recorded scenario: the base and the head side by side, each with its player, screenshots and facts. */
export function FilmCard({ film }: { readonly film: FilmView }) {
  const { t } = useI18n();
  const before = t('pullRequests.films.before');
  const after = t('pullRequests.films.after');
  return (
    <article className="film" aria-label={t('pullRequests.films.scenario', { scenario: film.scenario })}>
      <header className="film__header">
        <h3 className="film__scenario mono">{film.scenario}</h3>
        <span className="subtle">
          {t('pullRequests.films.recorded')} <Time iso={film.recordedAt} />
        </span>
      </header>
      <div className="film__phases">
        <FilmPhase scenario={film.scenario} phase={film.before} title={before} playerLabel={t('pullRequests.films.player', { phase: before, scenario: film.scenario })} />
        <FilmPhase scenario={film.scenario} phase={film.after} title={after} playerLabel={t('pullRequests.films.player', { phase: after, scenario: film.scenario })} />
      </div>
    </article>
  );
}
