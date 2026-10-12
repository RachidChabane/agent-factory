import './settings.css';
import { useMemo } from 'react';
import { useNow } from '../../app/context.tsx';
import { useCommand, useSnapshot } from '../../app/hooks.ts';
import type { RoleSetting, ToolName } from '../../contract/index.ts';
import { Card, Section } from '../../ui/components/Card.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import type { LimitsValues } from './LimitsForm.tsx';
import { LimitsForm } from './LimitsForm.tsx';
import { RoleRow } from './RoleRow.tsx';
import { connectedCount, sortTools, uncheckedTools } from './settings-model.ts';
import { ToolList } from './ToolList.tsx';

const ROLE_SUCCESS = 'Rôle mis à jour';
const LIMITS_SUCCESS = 'Limites mises à jour';
const TOOL_TEST_SUCCESS = 'Test de connexion lancé';
const SKELETON_HEIGHT = 200;

export function SettingsView() {
  const snapshot = useSnapshot();
  const now = useNow();
  const command = useCommand();
  const settings = snapshot?.settings ?? null;
  const tools = useMemo(() => (settings === null ? [] : sortTools(settings.tools, settings.configuredTools)), [settings]);
  const unchecked = useMemo(() => (settings === null ? [] : uncheckedTools(settings.tools, settings.configuredTools)), [settings]);

  const saveRole = (role: RoleSetting) => {
    void command.run('settings.update-role', role, ROLE_SUCCESS);
  };
  const saveLimits = (values: LimitsValues) => {
    void command.run('settings.update-limits', values, LIMITS_SUCCESS);
  };
  const testTool = (tool: ToolName) => {
    void command.run('settings.test-tool', { tool }, TOOL_TEST_SUCCESS);
  };

  return (
    <Page width="narrow">
      <PageHeader title="Réglages" description="Modèles et budgets des agents, limites de l’usine et état des outils connectés." />
      {settings === null ? (
        <div className="settings-skeleton" aria-busy="true" aria-label="Chargement des réglages">
          <Skeleton height={SKELETON_HEIGHT} />
          <Skeleton height={SKELETON_HEIGHT} />
        </div>
      ) : (
        <>
          <Section title="Rôles des agents" id="settings-roles">
            <Card padded={false}>
              <ul className="settings-roles">
                {settings.roles.map((role) => (
                  <RoleRow
                    key={`${role.role}-${role.model}-${role.effort}-${role.maxBudgetUsd}-${role.maxTurns}`}
                    role={role}
                    models={settings.models}
                    saving={command.pending === 'settings.update-role'}
                    onSave={saveRole}
                  />
                ))}
              </ul>
            </Card>
          </Section>
          <Section title="Limites" id="settings-limits">
            <LimitsForm
              key={`${settings.concurrency.ceiling}-${settings.resourceGuard.freeMemoryThresholdPercent}-${settings.resourceGuard.pauseAbovePressure}`}
              settings={settings}
              saving={command.pending === 'settings.update-limits'}
              onSave={saveLimits}
            />
          </Section>
          <Section title="Connexions des outils" id="settings-tools" description={`${connectedCount(settings.tools)} sur ${settings.configuredTools.length} connectés`}>
            <Card padded={false}>
              <ToolList tools={tools} unchecked={unchecked} now={now} testing={command.pending === 'settings.test-tool'} onTest={testTool} />
            </Card>
          </Section>
        </>
      )}
    </Page>
  );
}
