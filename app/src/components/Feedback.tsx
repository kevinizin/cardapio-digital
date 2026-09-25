import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DomainError, DomainWarning } from '../domain/errors';
import { conflictMessage, useI18n } from '../i18n';
import { useData } from '../state/store';

/* ---------- Toasts ---------- */

type ToastTone = 'success' | 'info' | 'warning' | 'error';

interface ToastInput {
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

const TOAST_ICONS = { success: CircleCheck, info: Info, warning: TriangleAlert, error: CircleAlert } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((item) => item.id !== id)), []);
  const notify = useCallback(
    (toast: ToastInput) => {
      counter.current += 1;
      const id = counter.current;
      setItems((list) => [...list.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === 'error' || toast.tone === 'warning' ? 10_000 : 6_000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions">
        {items.map((item) => {
          const Icon = TOAST_ICONS[item.tone];
          return (
            <div key={item.id} className={`toast toast--${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>
              <Icon aria-hidden="true" />
              <div className="toast__body">
                <p className="toast__title">{item.title}</p>
                {item.description && <p>{item.description}</p>}
              </div>
              <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={() => dismiss(item.id)} aria-label={t.common.close}>
                <X aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ---------- Avisos em linha ---------- */

interface NoticeProps {
  tone?: 'info' | 'warning' | 'danger' | 'success' | 'neutral';
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}

const NOTICE_ICONS = { info: Info, warning: TriangleAlert, danger: CircleAlert, success: CircleCheck, neutral: Info } as const;

export function Notice({ tone = 'info', title, children, icon, className, role }: NoticeProps) {
  const Icon = NOTICE_ICONS[tone];
  return (
    <div className={`notice notice--${tone}${className ? ` ${className}` : ''}`} role={role}>
      {icon ?? <Icon aria-hidden="true" />}
      <div className="notice__body">
        {title && <p className="notice__title">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** Erros das regras, com a lista de conflitos quando houver (uso administrativo). */
export function InlineErrors({ errors, showConflicts = true }: { errors: DomainError[]; showConflicts?: boolean }) {
  const data = useData();
  const { errorMessage } = useI18n();
  if (!errors.length) return null;
  return (
    <Notice tone="danger" role="alert" title={errors.length === 1 ? errorMessage(errors[0]) : undefined}>
      {errors.length > 1 && (
        <ul>
          {errors.map((error, index) => (
            <li key={`${error.code}-${index}`}>{errorMessage(error)}</li>
          ))}
        </ul>
      )}
      {showConflicts &&
        errors.flatMap((error) => error.conflicts ?? []).length > 0 && (
          <ul>
            {errors
              .flatMap((error) => error.conflicts ?? [])
              .map((conflict) => (
                <li key={`${conflict.id}-${conflict.segment}-${conflict.start}`}>{conflictMessage(conflict, data)}</li>
              ))}
          </ul>
        )}
    </Notice>
  );
}

export function WarningList({ warnings }: { warnings: DomainWarning[] }) {
  const { warningMessage } = useI18n();
  if (!warnings.length) return null;
  return (
    <Notice tone="warning" role="status">
      <ul>
        {warnings.map((warning, index) => (
          <li key={`${warning.code}-${index}`}>{warningMessage(warning)}</li>
        ))}
      </ul>
    </Notice>
  );
}

/** Mapa campo → primeira mensagem de erro, para formulários. */
export function useFieldErrors(errors: DomainError[]) {
  const { errorMessage } = useI18n();
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const error of errors) {
      if (error.field && !map[error.field]) map[error.field] = errorMessage(error);
    }
    return map;
  }, [errors, errorMessage]);
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon}
      <p className="empty-state__title">{title}</p>
      {children}
    </div>
  );
}
