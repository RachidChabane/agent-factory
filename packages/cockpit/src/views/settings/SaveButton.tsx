import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import type { SaveCommand } from './use-save-command.ts';

interface SaveButtonProps {
  readonly command: SaveCommand;
  /** The name of the button for assistive technology, when several forms of a page each have a Save. */
  readonly label?: string | undefined;
}

/** The submit button of a settings form: disabled until the form holds a valid change. */
export function SaveButton({ command, label }: SaveButtonProps) {
  const { t } = useI18n();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={!command.canSave} loading={command.pending} aria-label={label}>
      {t('common.save')}
    </Button>
  );
}
