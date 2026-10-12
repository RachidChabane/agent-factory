import { CircleCheck, Send } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { AuditView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { canPublishAuditIssue, canResolveAudit } from '../../model/actions.ts';
import { Button } from '../../ui/components/Button.tsx';
import { CommandButton } from '../../widgets/CommandButton.tsx';

const ICON_SIZE = 14;

interface AuditActionsProps {
  readonly audit: AuditView;
  readonly onResolve: () => void;
}

export function AuditActions({ audit, onResolve }: AuditActionsProps) {
  const { t } = useI18n();
  const project = useProject();
  return (
    <>
      {canPublishAuditIssue(audit) ? (
        <CommandButton command="audit.publish-issue" body={{ project: project.id, auditId: audit.id }} icon={<Send size={ICON_SIZE} />}>
          {t('audits.action.publish')}
        </CommandButton>
      ) : null}
      {canResolveAudit(audit) ? (
        <Button variant="primary" icon={<CircleCheck size={ICON_SIZE} />} onClick={onResolve}>
          {t('audits.action.resolve')}
        </Button>
      ) : null}
    </>
  );
}
