import { useSnapshot } from '../../app/hooks.ts';
import type { RunView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { costBasisOfRun } from '../../model/cost-basis.ts';
import { runMark } from '../../model/status.ts';
import { describeRunSubject } from '../../model/subjects.ts';
import { AgentGlyph } from '../../ui/components/AgentGlyph.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ListItemLink } from '../../ui/layout/Page.tsx';
import { AccountLabel } from '../../widgets/AccountLabel.tsx';
import { Money } from '../../widgets/Money.tsx';
import { ProjectTag } from '../../widgets/ProjectTag.tsx';
import { Time } from '../../widgets/Time.tsx';
import { isCostPending } from './run-model.ts';
import { runPath } from './run-list-model.ts';

const GLYPH_SIZE = 15;

function RunProjectTag({ project }: { readonly project: string | null }) {
  const { t } = useI18n();
  return project === null ? <span className="project-tag">{t('runs.project.installation')}</span> : <ProjectTag project={project} />;
}

interface RunListItemProps {
  readonly run: RunView;
  readonly active: boolean;
  /** Whether the project is named, which is when the list is not narrowed to one project. */
  readonly showProject: boolean;
  /** The project the list is filtered on, which the address of the run keeps. */
  readonly filterProject: string | null;
}

export function RunListItem({ run, active, showProject, filterProject }: RunListItemProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const snapshot = useSnapshot();
  const subject = describeRunSubject(snapshot, run);
  return (
    <ListItemLink to={runPath(run.id, filterProject)} active={active}>
      {run.status === 'running' ? <AgentGlyph size={GLYPH_SIZE} label={t('agent.working')} /> : <StatusMark mark={runMark(run.status)} label={vocabulary.runStatus(run.status)} />}
      <span className="list-item__body">
        <span className="list-item__title">
          {vocabulary.role(run.role)} · {subject.reference}
          {subject.title === null ? '' : ` ${subject.title}`}
        </span>
        <span className="list-item__meta">
          <span className="mono truncate">{run.model}</span>
          {showProject ? (
            <>
              <span className="dot-separator" />
              <RunProjectTag project={run.project} />
            </>
          ) : null}
          {run.status === 'waiting' ? (
            <>
              <span className="dot-separator" />
              <span className="run-list__waiting">{vocabulary.runStatus('waiting')}</span>
            </>
          ) : null}
        </span>
        <span className="list-item__meta">
          {isCostPending(run) ? <span className="truncate">{t('runs.cost.pending')}</span> : <Money amount={run.costUsd} basis={costBasisOfRun(snapshot, run)} />}
          {run.account === null ? null : (
            <>
              <span className="dot-separator" />
              <AccountLabel name={run.account} className="truncate" />
            </>
          )}
        </span>
      </span>
      <span className="list-item__aside">
        <Time iso={run.startedAt} className="num" />
      </span>
    </ListItemLink>
  );
}
