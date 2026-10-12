import { Bot } from 'lucide-react';
import { useProject } from '../app/ProjectRoute.tsx';
import type { DelegatedDecisionView } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { Card } from '../ui/components/Card.tsx';
import { DelegatedDecisionList } from './DelegatedDecisionList.tsx';

const ICON_SIZE = 16;

/** The gestures the delegate made on an issue or a pull request, with the reason it gave: nothing when it made none. */
export function DelegatedMarks({ decisions }: { readonly decisions: readonly DelegatedDecisionView[] }) {
  const { t } = useI18n();
  const project = useProject();
  const [latest] = decisions;
  if (latest === undefined) return null;
  return (
    <section className="callout" aria-label={t('autonomy.mark.title')}>
      <Bot size={ICON_SIZE} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('autonomy.mark.title')}</p>
        <p className="subtle">{t('autonomy.mark.description', { actor: latest.actor })}</p>
        <Card padded={false} tone="inset">
          <DelegatedDecisionList project={project.id} decisions={decisions} label={t('autonomy.list')} />
        </Card>
      </div>
    </section>
  );
}
