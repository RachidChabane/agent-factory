import type { AgentRole } from '@agent-factory/domain';
import type { RoleSetting } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { RoleRow } from './RoleRow.tsx';

interface RoleEditorProps {
  /** The project the roles are set for, or null for the installation defaults. */
  readonly project: string | null;
  readonly roles: readonly RoleSetting[];
  readonly models: readonly string[];
  /** The roles whose prompt the project replaces; none for the installation defaults. */
  readonly overriddenPrompts?: readonly AgentRole[] | undefined;
}

/** The roles of the agents with their model and limits, each saved on its own. */
export function RoleEditor({ project, roles, models, overriddenPrompts = [] }: RoleEditorProps) {
  const { t } = useI18n();
  if (roles.length === 0) return <EmptyState compact title={t('settings.roles.empty')} />;
  return (
    <Card padded={false}>
      <ul className="role-list" aria-label={t('settings.roles.list')}>
        {roles.map((setting) => (
          <RoleRow key={setting.role} project={project} setting={setting} models={models} promptOverridden={overriddenPrompts.includes(setting.role)} />
        ))}
      </ul>
    </Card>
  );
}
