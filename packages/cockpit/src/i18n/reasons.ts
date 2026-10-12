import type { AuditState } from '@agent-factory/domain';
import { AUDIT_STATES } from '@agent-factory/domain';
import { shortSha } from '../format/format.ts';
import { AUDIT_STATE_LABELS } from './labels.ts';

interface ReasonPattern {
  readonly pattern: RegExp;
  readonly render: (match: RegExpExecArray) => string;
}

function isAuditState(value: string | undefined): value is AuditState {
  return AUDIT_STATES.some((state) => state === value);
}

const REASON_PATTERNS: readonly ReasonPattern[] = [
  {
    pattern: /^audit (\S+) is open on commit (\S+)$/,
    render: (match) => {
      const state = match[1];
      const label = isAuditState(state) ? AUDIT_STATE_LABELS[state].toLocaleLowerCase('fr-FR') : (state ?? '');
      return `Audit « ${label} » ouvert sur le commit ${shortSha(match[2] ?? '')}`;
    },
  },
  {
    pattern: /^pull request #(\d+) has incomplete evidence$/,
    render: (match) => `La pull request #${match[1] ?? ''} a des preuves incomplètes`,
  },
  {
    pattern: /^no PREP health check has been recorded$/,
    render: () => 'Aucun contrôle de santé PREP n’a été enregistré',
  },
  {
    pattern: /^PREP health check (.+) failed$/,
    render: (match) => `Le contrôle de santé PREP « ${match[1] ?? ''} » a échoué`,
  },
];

export function translateGateReason(reason: string): string {
  for (const { pattern, render } of REASON_PATTERNS) {
    const match = pattern.exec(reason);
    if (match !== null) return render(match);
  }
  return reason;
}
