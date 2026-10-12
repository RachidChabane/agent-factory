import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import type { StatusMark as StatusMarkKind } from '../../model/status.ts';
import { baseTestMark, branchTestMark } from '../../model/status.ts';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import type { EvidenceOf } from './evidence-model.ts';
import { criterionGroups } from './evidence-model.ts';

const MARK_SIZE = 13;
const COLUMN_COUNT = 3;

function Outcome({ mark, label }: { readonly mark: StatusMarkKind; readonly label: string }) {
  return (
    <span className="acceptance__outcome">
      <StatusMark mark={mark} size={MARK_SIZE} label={label} />
      <span>{label}</span>
    </span>
  );
}

export function AcceptanceTestsEvidence({ evidence }: { readonly evidence: EvidenceOf<'acceptance-tests'> }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <div className="acceptance">
      <div className="ds-table-wrap">
        <table className="acceptance__table" aria-label={t('pullRequests.acceptance.table')}>
          <thead>
            <tr>
              <th scope="col">{t('pullRequests.acceptance.test')}</th>
              <th scope="col">{t('pullRequests.acceptance.base')}</th>
              <th scope="col">{t('pullRequests.acceptance.branch')}</th>
            </tr>
          </thead>
          {criterionGroups(evidence).map((group) => (
            <tbody key={group.criterion}>
              <tr className="acceptance__criterion">
                <th scope="colgroup" colSpan={COLUMN_COUNT}>
                  <span className="num">{t('pullRequests.acceptance.criterion', { number: group.criterion })}</span>
                  {group.text === null ? null : <span className="acceptance__criterion-text">{group.text}</span>}
                </th>
              </tr>
              {group.rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="subtle">
                    {t('pullRequests.acceptance.noTest')}
                  </td>
                </tr>
              ) : (
                group.rows.map((row, position) => (
                  <tr key={`${position}-${row.test}-${row.name}`}>
                    <td className="acceptance__test mono" title={row.test}>
                      {row.name}
                    </td>
                    <td>
                      <Outcome mark={baseTestMark(row.base)} label={vocabulary.baseTestResult(row.base)} />
                    </td>
                    <td>
                      <Outcome mark={branchTestMark(row.branch)} label={vocabulary.branchTestResult(row.branch)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          ))}
        </table>
      </div>
      <p className="evidence__note">{evidence.runner === null ? t('pullRequests.acceptance.noRunner') : t('pullRequests.acceptance.runner', { runner: vocabulary.testRunner(evidence.runner) })}</p>
    </div>
  );
}
