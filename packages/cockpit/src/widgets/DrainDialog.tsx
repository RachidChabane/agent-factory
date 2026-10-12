import { useI18n } from '../i18n/I18nProvider.tsx';
import { CommandDialog } from './CommandDialog.tsx';

interface DrainDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Asks for confirmation before the factory is told to stop once its running work has finished. */
export function DrainDialog({ open, onClose }: DrainDialogProps) {
  const { t } = useI18n();
  return (
    <CommandDialog
      open={open}
      onClose={onClose}
      command="factory.drain"
      body={{}}
      title={t('drain.dialogTitle')}
      description={t('drain.dialogDescription')}
      confirmLabel={t('drain.confirm')}
      tone="danger"
    />
  );
}
