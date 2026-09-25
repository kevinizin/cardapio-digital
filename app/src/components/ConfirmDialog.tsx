import type { ReactNode } from 'react';
import { t } from '../i18n';
import { Dialog } from './Dialog';
import { InlineErrors } from './Feedback';
import type { DomainError } from '../domain/errors';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  confirmDisabled?: boolean;
  errors?: DomainError[];
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmação explícita para ações irreversíveis ou sensíveis. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  busy = false,
  confirmDisabled = false,
  errors,
  children,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t.common.back}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            aria-busy={busy}
          >
            {busy && <span className="spinner" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
      {errors && errors.length > 0 && <InlineErrors errors={errors} />}
    </Dialog>
  );
}
