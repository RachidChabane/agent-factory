import { useState } from 'react';
import { FILM_SCENARIO_MAX_LENGTH, isFilmScenarioName } from '@agent-factory/domain';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { CommandBody, PullRequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Field, TextInput } from '../../ui/components/Field.tsx';
import { CommandDialog } from '../../widgets/CommandDialog.tsx';

interface FilmOrderDialogProps {
  readonly pullRequest: Pick<PullRequestView, 'number' | 'issueNumber'>;
  readonly onClose: () => void;
}

/** Asks for the name of a scenario, which the domain's rule validates, and orders its film on the pull request. */
export function FilmOrderDialog({ pullRequest, onClose }: FilmOrderDialogProps) {
  const { t } = useI18n();
  const project = useProject();
  const [scenario, setScenario] = useState('');
  const [attempted, setAttempted] = useState(false);
  const name = scenario.trim();
  const valid = isFilmScenarioName(name);
  const body: CommandBody<'pr.film'> | null = valid ? { project: project.id, issueNumber: pullRequest.issueNumber, scenario: name } : null;
  const rule = t('pullRequests.films.order.rule', { max: FILM_SCENARIO_MAX_LENGTH });
  return (
    <CommandDialog
      open
      onClose={onClose}
      command="pr.film"
      body={body}
      onInvalid={() => setAttempted(true)}
      title={t('pullRequests.films.order.title', { number: pullRequest.number })}
      description={t('pullRequests.films.order.description')}
      confirmLabel={t('pullRequests.films.order.confirm')}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <Field label={t('pullRequests.films.order.scenario')} hint={rule} error={attempted && !valid ? t('pullRequests.films.order.error', { rule }) : null}>
          {(id, describedBy) => <TextInput id={id} aria-describedby={describedBy} value={scenario} onChange={(event) => setScenario(event.currentTarget.value)} />}
        </Field>
      </form>
    </CommandDialog>
  );
}
