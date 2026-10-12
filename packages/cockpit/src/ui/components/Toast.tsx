import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';

export const TOAST_TONES = ['success', 'error', 'info'] as const;
export type ToastTone = (typeof TOAST_TONES)[number];

export const TOAST_DURATION_MS = 4500;

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

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const show = useCallback(
    (tone: ToastTone, title: string, description?: string | undefined) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current, { id, tone, title, description: description ?? null }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ds-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`ds-toast ds-toast--${toast.tone}`}>
            <span className="ds-toast__icon">{TONE_ICONS[toast.tone]}</span>
            <div className="ds-toast__text">
              <p className="ds-toast__title">{toast.title}</p>
              {toast.description === null ? null : <p className="ds-toast__description">{toast.description}</p>}
            </div>
            <button type="button" className="ds-toast__close" aria-label="Fermer la notification" onClick={() => dismiss(toast.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error('useToast must be used inside ToastProvider');
  return api;
}
