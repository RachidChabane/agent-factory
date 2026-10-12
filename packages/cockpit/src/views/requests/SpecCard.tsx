import { useState } from 'react';
import { Link } from 'react-router';
import { Pencil, TriangleAlert } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { ProposedSpec, RequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { SpecContent } from '../issues/SpecContent.tsx';
import { isSpecOpen } from './request-model.ts';
import { SpecEditDialog } from './SpecEditDialog.tsx';

const ICON_SIZE = 13;

interface SpecCardProps {
  readonly request: RequestView;
  readonly spec: ProposedSpec;
  readonly sources: readonly number[];
  readonly selected: boolean;
  readonly onToggle: () => void;
}

export function SpecCard({ request, spec, sources, selected, onToggle }: SpecCardProps) {
  const { t, fmt } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const [editing, setEditing] = useState(false);
  const open = isSpecOpen(request, spec);
  return (
    <article className={`spec-card${open && selected ? ' is-selected' : ''}`}>
      <header className="spec-card__header">
        {open ? <input type="checkbox" className="spec-card__check" checked={selected} onChange={onToggle} aria-label={t('requests.specs.keep', { title: spec.title })} /> : null}
        <h3 className="spec-card__title">{spec.title}</h3>
        <Badge>{vocabulary.issueType(spec.type)}</Badge>
        {spec.issueNumber === null ? null : (
          <Link to={paths.issue(project.id, spec.issueNumber)}>
            <Badge tone="success">{t('requests.specs.issue', { number: spec.issueNumber })}</Badge>
          </Link>
        )}
        {open ? (
          <Button size="sm" variant="ghost" icon={<Pencil size={ICON_SIZE} />} aria-label={t('requests.specs.edit', { title: spec.title })} onClick={() => setEditing(true)}>
            {t('common.edit')}
          </Button>
        ) : null}
      </header>
      {sources.length === 0 ? null : <p className="spec-card__sources subtle">{t('requests.specs.fromPoints', { count: sources.length, points: fmt.list(sources.map(String)) })}</p>}
      <SpecContent spec={spec} />
      {spec.problems.length === 0 ? null : (
        <div className="callout callout--waiting" role="note">
          <TriangleAlert size={16} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">{t('requests.specs.problems')}</p>
            <ul className="bullets">
              {spec.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {editing ? <SpecEditDialog request={request} spec={spec} onClose={() => setEditing(false)} /> : null}
    </article>
  );
}
