import './spec-content.css';
import type { ReactNode } from 'react';
import type { IssueSpecView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';

type SpecFields = Pick<IssueSpecView, 'need' | 'acceptanceCriteria' | 'outOfScope' | 'expectedProof'> & { readonly films?: IssueSpecView['films'] | undefined };

function Block({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="spec-content__block">
      <p className="small-caps">{title}</p>
      {children}
    </div>
  );
}

function Prose({ text }: { readonly text: string }) {
  const { t } = useI18n();
  return text.trim().length === 0 ? <p className="subtle">{t('issues.spec.notStated')}</p> : <p className="prose spec-content__text">{text}</p>;
}

export function SpecContent({ spec }: { readonly spec: SpecFields }) {
  const { t } = useI18n();
  return (
    <div className="spec-content">
      <Block title={t('issues.spec.need')}>
        <Prose text={spec.need} />
      </Block>
      <Block title={t('issues.spec.criteria')}>
        {spec.acceptanceCriteria.length === 0 ? (
          <p className="subtle">{t('issues.spec.noCriteria')}</p>
        ) : (
          <ol className="numbered">
            {spec.acceptanceCriteria.map((criterion, index) => (
              <li key={`${index}-${criterion}`}>{criterion}</li>
            ))}
          </ol>
        )}
      </Block>
      <Block title={t('issues.spec.outOfScope')}>
        {spec.outOfScope.length === 0 ? (
          <p className="subtle">{t('issues.spec.nothingOutOfScope')}</p>
        ) : (
          <ul className="bullets">
            {spec.outOfScope.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        )}
      </Block>
      <Block title={t('issues.spec.proof')}>
        <Prose text={spec.expectedProof} />
      </Block>
      {spec.films === undefined || spec.films.length === 0 ? null : (
        <Block title={t('issues.spec.films')}>
          <ul className="bullets">
            {spec.films.map((scenario) => (
              <li key={scenario} className="mono">
                {scenario}
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}
