import { Link } from 'react-router';
import { Moon } from 'lucide-react';
import { useSnapshot } from '../../app/hooks.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { liveRunsOf } from '../../model/projects.ts';
import { paths } from '../../model/routes.ts';
import { describeRunSubject } from '../../model/subjects.ts';
import { AgentGlyph } from '../../ui/components/AgentGlyph.tsx';
import { Badge } from '../../ui/components/Badge.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { ProjectTag } from '../../widgets/ProjectTag.tsx';
import { Time } from '../../widgets/Time.tsx';

interface LiveRunsProps {
  readonly project: string | null;
  /** Words every shown run must contain in its role, subject, model or branch. */
  readonly query?: string | undefined;
}

/** The agents at work right now, each one a link to its live log. */
export function LiveRuns({ project, query = '' }: LiveRunsProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const snapshot = useSnapshot();
  const terms = query.trim().toLowerCase().split(/\s+/).filter((term) => term.length > 0);
  const runs = liveRunsOf(snapshot, project).filter((run) => {
    const subject = describeRunSubject(snapshot, run);
    const text = [run.role, vocabulary.role(run.role), run.model, run.branch, run.lastLine, subject.reference, subject.title].filter((part): part is string => part !== null).join(' ').toLowerCase();
    return terms.every((term) => text.includes(term));
  });
  if (runs.length === 0) {
    return (
      <section className="live-runs live-runs--empty" aria-label={t('board.live.list')}>
        <EmptyState compact icon={<Moon size={16} />} title={t('board.live.empty')} />
      </section>
    );
  }
  return (
    <section className="live-runs" aria-label={t('board.live.list')}>
      <h2 className="live-runs__title small-caps">
        {t('board.live.title')} · {runs.length}
      </h2>
      <ul className="live-runs__list">
        {runs.map((run) => {
          const subject = describeRunSubject(snapshot, run);
          return (
            <li key={run.id}>
              <Link to={paths.run(run.id)} className="live-run">
                <span className="live-run__glyph" aria-hidden="true">
                  <AgentGlyph size={16} />
                </span>
                <span className="live-run__body">
                  <span className="live-run__title truncate">
                    {vocabulary.role(run.role)} · {subject.reference}
                    {subject.title === null ? '' : ` ${subject.title}`}
                  </span>
                  <span className="live-run__line truncate">{run.lastLine ?? run.currentTool ?? run.model}</span>
                </span>
                <span className="live-run__aside">
                  {run.status === 'waiting' ? <Badge tone="waiting">{t('board.live.waiting')}</Badge> : null}
                  {project === null && run.project !== null ? <ProjectTag project={run.project} /> : null}
                  <Time iso={run.startedAt} className="num" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
