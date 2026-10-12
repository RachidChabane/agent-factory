import type { ReactNode } from 'react';
import { CopyButton } from './CopyButton.tsx';

interface CodeBlockProps {
  readonly code: string;
  readonly title?: ReactNode | undefined;
  readonly copyable?: boolean | undefined;
  readonly maxHeight?: number | undefined;
  readonly tone?: 'default' | 'success' | 'failed' | undefined;
  readonly wrap?: boolean | undefined;
}

export function CodeBlock({ code, title, copyable = true, maxHeight, tone = 'default', wrap = false }: CodeBlockProps) {
  return (
    <figure className={`ds-code ds-code--${tone}`}>
      {title === undefined && !copyable ? null : (
        <figcaption className="ds-code__header">
          <span className="ds-code__title">{title}</span>
          {copyable ? <CopyButton text={code} label="Copier le contenu" /> : null}
        </figcaption>
      )}
      <pre className={`ds-code__body${wrap ? ' is-wrapped' : ''}`} style={maxHeight === undefined ? undefined : { maxHeight }} tabIndex={0}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

interface InlineCommandProps {
  readonly command: string;
}

export function InlineCommand({ command }: InlineCommandProps) {
  return (
    <span className="ds-inline-command">
      <code className="truncate">{command}</code>
      <CopyButton text={command} label="Copier la commande" />
    </span>
  );
}
