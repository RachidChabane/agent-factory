import { en } from '../../packages/cockpit/src/i18n/catalog/en/index.ts';

const ROLE_LABELS: Readonly<Record<string, string>> = {
  challenger: en['vocab.role.challenger'],
  'acceptance-author': en['vocab.role.acceptance-author'],
  implementer: en['vocab.role.implementer'],
  reviewer: en['vocab.role.reviewer'],
  auditor: en['vocab.role.auditor'],
  'release-auditor': en['vocab.role.release-auditor'],
  summarizer: en['vocab.role.summarizer'],
};

/** The name of an agent role as the cockpit writes it in English. */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
