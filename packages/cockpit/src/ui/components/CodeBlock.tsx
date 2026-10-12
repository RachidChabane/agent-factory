import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
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
  const { t } = useI18n();
  return (
    <figure className={`ds-code ds-code--${tone}`}>
      {title === undefined && !copyable ? null : (
        <figcaption className="ds-code__header">
          <span className="ds-code__title">{title}</span>
          {copyable ? <CopyButton text={code} label={t('common.copyContent')} /> : null}
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
  const { t } = useI18n();
  return (
    <span className="ds-inline-command">
      <code className="truncate">{command}</code>
      <CopyButton text={command} label={t('common.copyCommand')} />
    </span>
  );
}
