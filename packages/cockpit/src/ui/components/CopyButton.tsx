import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
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

export function CopyButton({ text, label = 'Copier', withText = false }: CopyButtonProps) {
  const { copied, copy } = useCopy(text);
  const icon = copied ? <Check size={14} /> : <Copy size={14} />;
  if (withText) {
    return (
      <Button size="sm" variant="secondary" icon={icon} onClick={copy}>
        {copied ? 'Copié' : label}
      </Button>
    );
  }
  return <IconButton size="sm" label={copied ? 'Copié' : label} icon={icon} onClick={copy} />;
}
