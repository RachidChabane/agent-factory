import { Ban, Scale } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { RequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { canChallengeRequest } from '../../model/actions.ts';
import { Button } from '../../ui/components/Button.tsx';
import { CommandButton } from '../../widgets/CommandButton.tsx';
import { canDeclineRequest } from './request-model.ts';

const ICON_SIZE = 14;

interface RequestActionsProps {
  readonly request: RequestView;
  readonly onDecline: () => void;
}

export function RequestActions({ request, onDecline }: RequestActionsProps) {
  const { t } = useI18n();
  const project = useProject();
  return (
    <>
      {canDeclineRequest(request) ? (
        <Button variant="ghost" icon={<Ban size={ICON_SIZE} />} onClick={onDecline}>
          {t('requests.action.decline')}
        </Button>
      ) : null}
      {canChallengeRequest(request) ? (
        <CommandButton command="request.challenge" body={{ project: project.id, requestId: request.id }} variant="primary" icon={<Scale size={ICON_SIZE} />}>
          {request.state === 'waiting-requester' ? t('requests.action.rechallenge') : t('requests.action.challenge')}
        </CommandButton>
      ) : null}
    </>
  );
}
