import { Link } from 'react-router';
import { Clock, Cpu, Folder, GitBranch, Hash, UserRound } from 'lucide-react';
import { useSnapshot } from '../../app/hooks.ts';
import type { RunView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { projectName } from '../../model/projects.ts';
import { paths } from '../../model/routes.ts';
import { runMark } from '../../model/status.ts';
import type { SubjectReference } from '../../model/subjects.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { CopyButton } from '../../ui/components/CopyButton.tsx';
import { RoleGlyph } from '../../ui/components/RoleGlyph.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DetailHeader, MetaItem } from '../../ui/layout/Page.tsx';
import { AccountLabel } from '../../widgets/AccountLabel.tsx';
import { Time } from '../../widgets/Time.tsx';
import { RunActions } from './RunActions.tsx';
import { attemptNumber, outcomeTone } from './run-model.ts';

const ICON_SIZE = 13;

function RunProject({ project }: { readonly project: string | null }) {
  const { t } = useI18n();
  const snapshot = useSnapshot();
  if (project === null) return <>{t('runs.project.installation')}</>;
  return (
    <Link to={paths.project(project)} className="link">
      {projectName(snapshot, project)}
    </Link>
  );
}

function RunSubject({ subject }: { readonly subject: SubjectReference }) {
  return subject.href === null ? (
    <span className="run-detail__reference">{subject.reference}</span>
  ) : (
    <Link to={subject.href} className="run-detail__reference">
      {subject.reference}
    </Link>
  );
}

interface RunHeaderProps {
  readonly run: RunView;
  readonly subject: SubjectReference;
  /** The list the run belongs to, which is where the way back leads. */
  readonly listPath: string;
}

export function RunHeader({ run, subject, listPath }: RunHeaderProps) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <DetailHeader
      back={{ to: listPath, label: t('runs.back') }}
      eyebrow={
        <>
          <StatusMark mark={runMark(run.status)} label={vocabulary.runStatus(run.status)} />
          <span>{vocabulary.runStatus(run.status)}</span>
          {run.outcome === null ? null : <Badge tone={outcomeTone(run.outcome)}>{vocabulary.runOutcome(run.outcome)}</Badge>}
          <span className="mono">{run.id}</span>
          <CopyButton text={run.id} label={t('common.copyIdentifier')} />
        </>
      }
      title={
        <>
          {vocabulary.role(run.role)} · <RunSubject subject={subject} /> {subject.title ?? <span className="subtle">{t('runs.noTitle')}</span>}
        </>
      }
      actions={<RunActions run={run} subject={subject} />}
      meta={
        <>
          <MetaItem>
            <RoleGlyph role={run.role} size={ICON_SIZE} labelled />
          </MetaItem>
          <MetaItem icon={<Cpu size={ICON_SIZE} />}>
            <span className="mono">{run.model}</span> · {t('runs.meta.effort', { effort: vocabulary.effort(run.effort) })}
          </MetaItem>
          <MetaItem icon={<Hash size={ICON_SIZE} />}>{t('runs.meta.attempt', { number: attemptNumber(run) })}</MetaItem>
          <MetaItem icon={<GitBranch size={ICON_SIZE} />}>{run.branch === null ? t('runs.meta.noBranch') : <span className="mono truncate">{run.branch}</span>}</MetaItem>
          <MetaItem icon={<Clock size={ICON_SIZE} />}>{rich('runs.meta.started', { when: <Time iso={run.startedAt} mode="dateTime" /> })}</MetaItem>
          <MetaItem icon={<Folder size={ICON_SIZE} />}>
            <RunProject project={run.project} />
          </MetaItem>
          {run.account === null ? null : (
            <MetaItem icon={<UserRound size={ICON_SIZE} />}>
              <span title={t('runs.meta.account')}>
                <AccountLabel name={run.account} />
              </span>
            </MetaItem>
          )}
        </>
      }
    />
  );
}
