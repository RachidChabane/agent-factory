import type { AgentRole } from '@agent-factory/domain';
import type { LucideIcon } from 'lucide-react';
import { FlaskConical, Hammer, NotebookText, PackageCheck, Scale, ScanEye, ShieldCheck } from 'lucide-react';
import { ROLE_LABELS } from '../../i18n/labels.ts';

const ROLE_ICONS: Readonly<Record<AgentRole, LucideIcon>> = {
  challenger: Scale,
  'acceptance-author': FlaskConical,
  implementer: Hammer,
  reviewer: ScanEye,
  auditor: ShieldCheck,
  'release-auditor': PackageCheck,
  summarizer: NotebookText,
};

interface RoleGlyphProps {
  readonly role: AgentRole;
  readonly size?: number | undefined;
  readonly labelled?: boolean | undefined;
}

export function RoleGlyph({ role, size = 14, labelled = false }: RoleGlyphProps) {
  const Icon = ROLE_ICONS[role];
  return (
    <span className="ds-role" title={ROLE_LABELS[role]}>
      <Icon size={size} aria-hidden="true" />
      {labelled ? <span>{ROLE_LABELS[role]}</span> : <span className="visually-hidden">{ROLE_LABELS[role]}</span>}
    </span>
  );
}
