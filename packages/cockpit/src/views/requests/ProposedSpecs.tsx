import { useState } from 'react';
import type { ChallengeReport, RequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { AcceptSpecs } from './AcceptSpecs.tsx';
import { canAcceptSpecs, initialSpecSelection, sourcePositions, specIdsToAccept } from './request-model.ts';
import { SpecCard } from './SpecCard.tsx';

function toggled(selection: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function ProposedSpecs({ request, report }: { readonly request: RequestView; readonly report: ChallengeReport }) {
  const { t } = useI18n();
  const [selection, setSelection] = useState(() => initialSpecSelection(report));
  const deciding = canAcceptSpecs(request);
  const specIds = specIdsToAccept(request, selection);
  const openSpecs = report.specs.filter((spec) => spec.issueNumber === null);
  return (
    <Section
      title={t('requests.specs.title')}
      id="request-specs"
      description={deciding ? t('requests.specs.hint') : undefined}
      actions={
        deciding ? (
          <>
            <span className="request-specs__selection subtle num">{t('requests.specs.selection', { selected: specIds.length, total: openSpecs.length })}</span>
            <AcceptSpecs request={request} specs={report.specs.filter((spec) => specIds.includes(spec.id))} />
          </>
        ) : undefined
      }
    >
      {report.specs.length === 0 ? (
        <EmptyState compact title={t('requests.specs.empty')} description={t('requests.specs.emptyDescription')} />
      ) : (
        <ul className="spec-list" aria-label={t('requests.specs.list')}>
          {report.specs.map((spec) => (
            <li key={spec.id}>
              <SpecCard request={request} spec={spec} sources={sourcePositions(spec, report.items)} selected={selection.has(spec.id)} onToggle={() => setSelection((current) => toggled(current, spec.id))} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
