import type { AuditView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { shortSha } from '../../model/identifiers.ts';
import { auditNeedsOperator } from '../../model/attention.ts';
import { paths } from '../../model/routes.ts';
import { auditMark } from '../../model/status.ts';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ListItemLink } from '../../ui/layout/Page.tsx';
import { Time } from '../../widgets/Time.tsx';

const STATE_SEPARATOR = ' · ';

interface AuditListItemProps {
  readonly audit: AuditView;
  readonly projectId: string;
  readonly active: boolean;
}

export function AuditListItem({ audit, projectId, active }: AuditListItemProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const state = vocabulary.auditState(audit.state);
  return (
    <ListItemLink to={paths.audit(projectId, audit.id)} active={active}>
      <StatusMark mark={auditMark(audit)} label={state} />
      <span className="list-item__body">
        <span className="list-item__title">{audit.commitMessage}</span>
        <span className="list-item__meta">
          <span className="mono">{shortSha(audit.commitSha)}</span>
          <span className="dot-separator" />
          <span className="truncate">{vocabulary.auditReason(audit.reason)}</span>
        </span>
        <span className={`audits-list__state${auditNeedsOperator(audit) ? ' is-attention' : ''}`}>{audit.resolved ? [state, t('audits.resolvedMark')].join(STATE_SEPARATOR) : state}</span>
      </span>
      <span className="list-item__aside">
        <Time iso={audit.detectedAt} className="num" />
      </span>
    </ListItemLink>
  );
}
