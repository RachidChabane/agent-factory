import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from './Button.tsx';
import { IconButton } from './IconButton.tsx';

export const COPIED_FEEDBACK_MS = 1600;

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function useCopy(text: string): { readonly copied: boolean; readonly copy: () => void } {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const handle = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(handle);
  }, [copied]);
  return {
    copied,
    copy: () => {
      void writeClipboard(text).then(setCopied);
    },
  };
}

interface CopyButtonProps {
  readonly text: string;
  readonly label?: string | undefined;
  readonly withText?: boolean | undefined;
}

export function CopyButton({ text, label, withText = false }: CopyButtonProps) {
  const { t } = useI18n();
  const { copied, copy } = useCopy(text);
  const copyLabel = label ?? t('common.copy');
  const icon = copied ? <Check size={14} /> : <Copy size={14} />;
  if (withText) {
    return (
      <Button size="sm" variant="secondary" icon={icon} onClick={copy}>
        {copied ? t('common.copied') : copyLabel}
      </Button>
    );
  }
  return <IconButton size="sm" label={copied ? t('common.copied') : copyLabel} icon={icon} onClick={copy} />;
}
