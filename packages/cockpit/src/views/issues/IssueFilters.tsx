import { Search } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { IssueView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Field, Select, TextInput } from '../../ui/components/Field.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import type { IssueFilter, IssueGroup } from './issue-model.ts';
import { isFiltering, ISSUE_GROUPS, issueTypeIds, issuesInGroup, NO_ISSUE_FILTER } from './issue-model.ts';

const ALL_TYPES = '';

interface IssueFiltersProps {
  readonly issues: readonly IssueView[];
  readonly shown: number;
  readonly filter: IssueFilter;
  readonly onChange: (filter: IssueFilter) => void;
}

export function IssueFilters({ issues, shown, filter, onChange }: IssueFiltersProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  return (
    <div className="issue-filters">
      <div className="issue-filters__groups">
        <Segmented<IssueGroup>
          label={t('issues.filter.group')}
          size="sm"
          value={filter.group}
          onChange={(group) => onChange({ ...filter, group })}
          items={ISSUE_GROUPS.map((group) => ({ id: group, label: t(`issues.group.${group}`), count: issuesInGroup(issues, group).length }))}
        />
      </div>
      <div className="issue-filters__fields">
        <div className="issue-filters__search">
          <Field label={t('issues.filter.search')} hideLabel>
            {(id) => (
              <span className="issue-filters__search-box">
                <Search size={14} aria-hidden="true" />
                <TextInput
                  id={id}
                  type="search"
                  value={filter.query}
                  placeholder={t('issues.filter.searchPlaceholder')}
                  onChange={(event) => onChange({ ...filter, query: event.currentTarget.value })}
                />
              </span>
            )}
          </Field>
        </div>
        <div className="issue-filters__type">
          <Field label={t('issues.filter.type')} hideLabel>
            {(id) => (
              <Select id={id} value={filter.type ?? ALL_TYPES} onChange={(event) => onChange({ ...filter, type: event.currentTarget.value === ALL_TYPES ? null : event.currentTarget.value })}>
                <option value={ALL_TYPES}>{t('issues.filter.allTypes')}</option>
                {issueTypeIds(project).map((type) => (
                  <option key={type} value={type}>
                    {vocabulary.issueType(type)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <p className="issue-filters__result subtle num" role="status">
          {t('issues.filter.result', { shown, count: issues.length })}
        </p>
        {isFiltering(filter) ? (
          <Button size="sm" variant="ghost" onClick={() => onChange(NO_ISSUE_FILTER)}>
            {t('issues.filter.clear')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
