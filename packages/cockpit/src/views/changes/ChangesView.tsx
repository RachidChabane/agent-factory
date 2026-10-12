import './changes.css';
import { useMemo, useState } from 'react';
import { useAttention } from '../../app/derived.ts';
import { useNow } from '../../app/context.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import { useSelectedProject } from '../../app/derived.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useToast } from '../../ui/components/Toast.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import { AwaitingSection } from './AwaitingSection.tsx';
import { buildChanges } from './changes-model.ts';
import type { SinceChoice } from './changes-since.ts';
import { CUSTOM_SINCE, matchingPreset, presetSince } from './changes-since.ts';
import { ChangesSummary } from './ChangesSummary.tsx';
import { ProjectChangesSection } from './ProjectChangesSection.tsx';
import { SinceControl } from './SinceControl.tsx';
import { useChangesSince } from './use-changes-since.ts';

/** The landing page: what changed since the operator last looked, and what waits for them, project by project. */
export function ChangesView() {
  const { t, fmt } = useI18n();
  const snapshot = useSnapshot();
  const now = useNow();
  const toast = useToast();
  const selected = useSelectedProject();
  const attention = useAttention(selected);
  const { since, seenAt, setSince, markSeen } = useChangesSince();
  const [chosen, setChosen] = useState<SinceChoice>(() => matchingPreset(since, now));
  const projects = useMemo(() => (selected === null ? snapshot.projects : snapshot.projects.filter((project) => project.id === selected)), [snapshot, selected]);
  const changes = useMemo(() => buildChanges(projects, since), [projects, since]);
  const baseBranches = useMemo(() => new Map(projects.map((project) => [project.id, project.baseBranch])), [projects]);

  const choose = (choice: SinceChoice) => {
    setChosen(choice);
    if (choice !== CUSTOM_SINCE) setSince(presetSince(choice, now));
  };
  const chooseCustom = (epoch: number) => {
    setChosen(CUSTOM_SINCE);
    setSince(epoch);
  };
  const confirmSeen = () => (markSeen() ? toast.show('success', t('changes.since.markedSeen')) : toast.show('error', t('changes.since.notKept')));

  return (
    <Page className="changes">
      <PageHeader
        title={t('changes.title')}
        description={t('changes.description', { since: fmt.dateTime(new Date(since).toISOString()) })}
        actions={<SinceControl since={since} choice={chosen} seenAt={seenAt} onChoose={choose} onCustom={chooseCustom} onMarkSeen={confirmSeen} />}
      />
      <ChangesSummary summary={changes.summary} awaiting={attention.length} />
      <AwaitingSection items={attention} />
      {changes.projects.map((project) => (
        <ProjectChangesSection key={project.id} project={project} baseBranch={baseBranches.get(project.id) ?? ''} />
      ))}
    </Page>
  );
}
