import type { RequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { requestMark } from '../../model/status.ts';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ListItemLink } from '../../ui/layout/Page.tsx';
import { Time } from '../../widgets/Time.tsx';

interface RequestListItemProps {
  readonly request: RequestView;
  readonly projectId: string;
  readonly active: boolean;
}

export function RequestListItem({ request, projectId, active }: RequestListItemProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const mark = requestMark(request.state);
  const state = [vocabulary.requestState(request.state), request.challenge === null ? null : t('requests.points', { count: request.challenge.items.length })].filter((part) => part !== null);
  return (
    <ListItemLink to={paths.request(projectId, request.id)} active={active}>
      <StatusMark mark={mark} />
      <span className="list-item__body">
        <span className="list-item__title">{request.title}</span>
        <span className="list-item__meta">
          <span className="mono">{request.id}</span>
          <span className="dot-separator" />
          <span className="truncate">{request.requester}</span>
        </span>
        <span className={`request-list__state request-list__state--${mark}`}>{state.join(' · ')}</span>
      </span>
      <span className="list-item__aside">
        <Time iso={request.updatedAt} className="num" />
      </span>
    </ListItemLink>
  );
}
