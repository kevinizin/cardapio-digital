import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useT } from '../i18n';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  variant?: 'default' | 'wide' | 'drawer';
  /** Enquanto uma ação é processada, Esc e clique fora não fecham. */
  dismissible?: boolean;
}

const FOCUSABLE = '[data-autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-dialog-close]), a[href]';

/**
 * Diálogo modal nativo: prende o foco, fecha com Esc, marca o fundo como
 * inerte e devolve o foco a quem abriu.
 */
export function Dialog({ open, onClose, title, description, children, footer, variant = 'default', dismissible = true }: DialogProps) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pointerStartedOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const restore = () => {
      const target = returnFocus.current;
      if (target && document.contains(target)) target.focus();
    };
    dialog.addEventListener('close', restore);
    return () => {
      dialog.removeEventListener('close', restore);
      // Diálogo desmontado aberto: fecha e devolve o foco a quem o abriu.
      if (dialog.open) {
        dialog.close();
        restore();
      }
    };
  }, []);

  const variantClass = variant === 'wide' ? ' dialog--wide' : variant === 'drawer' ? ' dialog--drawer' : '';

  return (
    <dialog
      ref={ref}
      className={`dialog${variantClass}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onMouseDown={(event) => {
        pointerStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (dismissible && pointerStartedOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="dialog__panel">
          <header className="dialog__header">
            <div>
              <h2 className="dialog__title" id={titleId}>
                {title}
              </h2>
              {description && (
                <p className="dialog__description" id={descriptionId}>
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--icon btn--sm"
              onClick={onClose}
              aria-label={t.common.close}
              disabled={!dismissible}
              data-dialog-close
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <div className="dialog__body">{children}</div>
          {footer && <footer className="dialog__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
