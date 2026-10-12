import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { Button } from '../ui/components/Button.tsx';
import { Dialog } from '../ui/components/Dialog.tsx';

export interface ConfirmCopy {
  readonly title: ReactNode;
  readonly description?: ReactNode | undefined;
  readonly confirmLabel: string;
  readonly tone?: 'primary' | 'danger' | undefined;
}

interface ConfirmDialogProps extends ConfirmCopy {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  /** True while the command behind the confirmation is in flight. */
  readonly pending: boolean;
  /** False keeps the confirm button disabled, for a form that is not valid yet. */
  readonly canConfirm?: boolean | undefined;
  readonly size?: 'sm' | 'md' | 'lg' | undefined;
  readonly children?: ReactNode | undefined;
}

/** A dialog that asks before an action that is hard to undo, with Cancel and the action named by its label. */
export function ConfirmDialog({ open, onClose, onConfirm, pending, canConfirm = true, size = 'sm', title, description, confirmLabel, tone = 'primary', children }: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size={size}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={pending} disabled={!canConfirm} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
