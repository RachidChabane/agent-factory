import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

const ICON_SIZE = 12;

interface ForgeLinkProps {
  readonly href: string;
  /** What the link opens, for assistive technology; it names the link when it has no visible text. */
  readonly label: string;
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
}

/** A link to the forge, opened in a new tab. */
export function ForgeLink({ href, label, children, className }: ForgeLinkProps) {
  return (
    <a className={['forge-link', className].filter(Boolean).join(' ')} href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}>
      {children}
      <ExternalLink size={ICON_SIZE} aria-hidden="true" />
    </a>
  );
}
