import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { IconButton } from './IconButton.tsx';

/** The field a dialog puts the cursor in when it opens: the one marked, else the first of its form. */
const FIRST_FIELD_SELECTOR = '[data-autofocus], input:not([type="hidden"]):not([type="file"]), textarea, select';

interface ModalSurfaceProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly description?: ReactNode | undefined;
  readonly children?: ReactNode | undefined;
  readonly footer?: ReactNode | undefined;
  readonly variant: 'dialog' | 'drawer';
  readonly size?: 'sm' | 'md' | 'lg' | undefined;
}

function ModalSurface({ open, onClose, title, description, children, footer, variant, size = 'md' }: ModalSurfaceProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>(FIRST_FIELD_SELECTOR)?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const onBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };
  return (
    <dialog
      ref={ref}
      className={`ds-${variant} ds-${variant}--${size}`}
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={onBackdrop}
    >
      {open ? (
        <div className={`ds-${variant}__panel`}>
          <header className={`ds-${variant}__header`}>
            <div className="ds-modal-heading">
              <h2 id={titleId} className="ds-modal-title">
                {title}
              </h2>
              {description === undefined ? null : (
                <div id={descriptionId} className="ds-modal-description">
                  {description}
                </div>
              )}
            </div>
            <IconButton label={t('common.close')} icon={<X size={16} />} size="sm" onClick={onClose} />
          </header>
          {children === undefined ? null : <div className={`ds-${variant}__body`}>{children}</div>}
          {footer === undefined ? null : <footer className={`ds-${variant}__footer`}>{footer}</footer>}
        </div>
      ) : null}
    </dialog>
  );
}

type SurfaceProps = Omit<ModalSurfaceProps, 'variant'>;

export function Dialog(props: SurfaceProps) {
  return <ModalSurface {...props} variant="dialog" />;
}

export function Drawer(props: SurfaceProps) {
  return <ModalSurface {...props} variant="drawer" />;
}
