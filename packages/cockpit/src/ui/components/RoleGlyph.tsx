import type { AgentRole } from '@agent-factory/domain';
import type { LucideIcon } from 'lucide-react';
import { FlaskConical, Hammer, NotebookText, PackageCheck, Scale, ScanEye, ShieldCheck } from 'lucide-react';
import { useVocabulary } from '../../i18n/vocabulary.ts';

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
  const vocabulary = useVocabulary();
  const Icon = ROLE_ICONS[role];
  const label = vocabulary.role(role);
  return (
    <span className="ds-role" title={label}>
      <Icon size={size} aria-hidden="true" />
      {labelled ? <span>{label}</span> : <span className="visually-hidden">{label}</span>}
    </span>
  );
}
