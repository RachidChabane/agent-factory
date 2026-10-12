import type { IssueView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { pipelineProgress } from './issue-model.ts';

export function IssuePipeline({ issue }: { readonly issue: Pick<IssueView, 'state' | 'resumeTarget'> }) {
  const { t } = useI18n();
  return (
    <ol className="pipeline" aria-label={t('issues.pipeline.label')}>
      {pipelineProgress(issue).map((stage) => (
        <li key={stage.id} className={`pipeline__stage pipeline__stage--${stage.status}`} aria-current={stage.status === 'current' || stage.status === 'stuck' ? 'step' : undefined}>
          <span className="pipeline__dot" aria-hidden="true" />
          <span>{t(`issues.stage.${stage.id}`)}</span>
          <span className="visually-hidden">{t(`issues.stage.status.${stage.status}`)}</span>
        </li>
      ))}
    </ol>
  );
}
