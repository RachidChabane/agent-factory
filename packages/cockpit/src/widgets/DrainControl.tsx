import { useId, useState } from 'react';
import { Power } from 'lucide-react';
import { useMaybeSnapshot } from '../app/hooks.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { DrainBlock } from '../model/actions.ts';
import { drainBlock } from '../model/actions.ts';
import { Button } from '../ui/components/Button.tsx';
import { IconButton } from '../ui/components/IconButton.tsx';
import { DrainDialog } from './DrainDialog.tsx';

const ICON_SIZE = 14;

interface DrainControlProps {
  /** A button with its label, or an icon alone where room is short. */
  readonly appearance: 'button' | 'icon';
  readonly className?: string | undefined;
}

function useBlockReason(block: DrainBlock | null): string | null {
  const { t } = useI18n();
  if (block === null) return null;
  return block === 'demonstration' ? t('drain.blockedDemonstration') : t('drain.blockedUnderway');
}

/**
 * Asks the factory to start nothing new and to stop once the issues, challenges and audits it is
 * running have finished. It asks for confirmation first, and says why it is unavailable when it is.
 */
export function DrainControl({ appearance, className }: DrainControlProps) {
  const { t } = useI18n();
  const installation = useMaybeSnapshot()?.installation;
  const [confirming, setConfirming] = useState(false);
  const reasonId = useId();
  const block = installation === undefined ? null : drainBlock(installation);
  const reason = useBlockReason(block);
  if (installation === undefined) return null;
  const label = reason === null ? t('drain.label') : t('drain.labelBlocked', { action: t('drain.label'), reason });
  return (
    <>
      {appearance === 'icon' ? (
        <IconButton label={label} icon={<Power size={ICON_SIZE} />} size="sm" className={className} disabled={block !== null} onClick={() => setConfirming(true)} />
      ) : (
        <span className="drain-control">
          <Button size="sm" className={className} icon={<Power size={ICON_SIZE} />} disabled={block !== null} aria-describedby={reason === null ? undefined : reasonId} onClick={() => setConfirming(true)}>
            {t('drain.label')}
          </Button>
          {reason === null ? null : (
            <span id={reasonId} className="drain-control__reason subtle">
              {reason}
            </span>
          )}
        </span>
      )}
      <DrainDialog open={confirming} onClose={() => setConfirming(false)} />
    </>
  );
}
