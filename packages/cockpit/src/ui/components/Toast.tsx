import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';

export const TOAST_TONES = ['success', 'error', 'info'] as const;
export type ToastTone = (typeof TOAST_TONES)[number];

export const TOAST_DURATION_MS = 4500;
export const ERROR_TOAST_DURATION_MS = 9000;

interface ToastMessage {
  readonly id: number;
  readonly tone: ToastTone;
  readonly title: string;
  readonly description: string | null;
}

interface ToastApi {
  show(tone: ToastTone, title: string, description?: string | undefined): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICONS: Readonly<Record<ToastTone, ReactNode>> = {
  success: <CircleCheck size={16} />,
  error: <CircleAlert size={16} />,
  info: <Info size={16} />,
};

function ToastItem({ toast, onDismiss }: { readonly toast: ToastMessage; readonly onDismiss: (id: number) => void }) {
  const { t } = useI18n();
  return (
    <div className={`ds-toast ds-toast--${toast.tone}`}>
      <span className="ds-toast__icon">{TONE_ICONS[toast.tone]}</span>
      <div className="ds-toast__text">
        <p className="ds-toast__title">{toast.title}</p>
        {toast.description === null ? null : <p className="ds-toast__description">{toast.description}</p>}
      </div>
      <button type="button" className="ds-toast__close" aria-label={t('toast.dismiss')} onClick={() => onDismiss(toast.id)}>
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);
  const counter = useRef(0);
  const handles = useRef(new Set<ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const show = useCallback(
    (tone: ToastTone, title: string, description?: string | undefined) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current, { id, tone, title, description: description ?? null }]);
      const handle = setTimeout(() => {
        handles.current.delete(handle);
        dismiss(id);
      }, tone === 'error' ? ERROR_TOAST_DURATION_MS : TOAST_DURATION_MS);
      handles.current.add(handle);
    },
    [dismiss],
  );
  useEffect(() => {
    const pending = handles.current;
    return () => {
      for (const handle of pending) clearTimeout(handle);
      pending.clear();
    };
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  const errors = toasts.filter((toast) => toast.tone === 'error');
  const others = toasts.filter((toast) => toast.tone !== 'error');
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ds-toasts">
        <div className="ds-toasts__group" role="status" aria-live="polite">
          {others.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
        <div className="ds-toasts__group" role="alert" aria-live="assertive">
          {errors.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error('useToast must be used inside ToastProvider');
  return api;
}
