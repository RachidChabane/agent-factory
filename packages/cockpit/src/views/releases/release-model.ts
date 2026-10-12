import { OPEN_AUDIT_STATES, UNRESOLVED_VERDICT_STATES } from '@agent-factory/domain';
import type { AuditView, ReleaseView } from '../../contract/index.ts';
import { plural } from '../../format/format.ts';
import type { StatusMark } from '../../model/status.ts';

export interface GateCondition {
  readonly label: string;
  readonly mark: StatusMark;
  readonly detail: string;
}

function isOpenAudit(audit: AuditView): boolean {
  return OPEN_AUDIT_STATES.includes(audit.state) || (UNRESOLVED_VERDICT_STATES.includes(audit.state) && !audit.resolved);
}

export function gateConditions(release: ReleaseView, audits: readonly AuditView[]): readonly GateCondition[] {
  const commitShas = new Set(release.commits.map((commit) => commit.sha));
  const related = audits.filter((audit) => commitShas.has(audit.commitSha));
  const open = related.filter(isOpenAudit);
  const factoryCommits = release.commits.filter((commit) => commit.attribution === 'factory-merge');
  const incomplete = factoryCommits.filter((commit) => commit.evidenceComplete === false);
  const failedHealth = release.prepHealth.filter((check) => !check.passed);
  return [
    {
      label: 'Audits résolus',
      mark: open.length === 0 ? 'success' : 'failed',
      detail:
        open.length === 0
          ? `${plural(related.length, 'audit', 'audits')}, aucun ouvert`
          : `${plural(open.length, 'audit ouvert', 'audits ouverts')} : ${open.map((audit) => audit.id).join(', ')}`,
    },
    {
      label: 'Preuves complètes',
      mark: incomplete.length === 0 ? 'success' : 'failed',
      detail:
        incomplete.length === 0
          ? `${plural(factoryCommits.length, 'pull request', 'pull requests')} de l’usine, preuves complètes`
          : `${plural(incomplete.length, 'pull request', 'pull requests')} sans preuve complète`,
    },
    {
      label: 'Santé PREP',
      mark: release.prepHealth.length === 0 ? 'idle' : failedHealth.length === 0 ? 'success' : 'failed',
      detail:
        release.prepHealth.length === 0
          ? 'aucun contrôle enregistré'
          : failedHealth.length === 0
            ? `${plural(release.prepHealth.length, 'contrôle réussi', 'contrôles réussis')}`
            : `${plural(failedHealth.length, 'contrôle en échec', 'contrôles en échec')}`,
    },
  ];
}
