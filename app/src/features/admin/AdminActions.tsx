import { ArrowLeftRight, CircleX, Hourglass, LogIn, Pencil, Sparkles, UserCheck, UserX } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ReservationStatusBadge, SourceLabel } from '../../components/Badges';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { InlineErrors, Notice, useToast, WarningList } from '../../components/Feedback';
import { describedBy, Field } from '../../components/Field';
import { LIMITS } from '../../domain/defaults';
import type { DomainError, DomainWarning } from '../../domain/errors';
import {
  cancelByAdmin,
  checkArrival,
  completeService,
  endPrepEarly,
  extendPrep,
  getActionStates,
  isPrepActive,
  markNoShow,
  noShowAvailableAt,
  registerArrival,
  type ReservationAction,
} from '../../domain/lifecycle';
import {
  findConflicts,
  plannedBlockEnd,
  plannedInterval,
  plannedServiceEnd,
  prepEndMs,
  projectedServiceEnd,
  segmentsForTable,
} from '../../domain/occupancy';
import { changeTable, type ReservationDraft } from '../../domain/reservations';
import { MINUTE_MS, parisDate, toMs } from '../../domain/time';
import type { Reservation } from '../../domain/types';
import {
  conflictMessage,
  errorMessage,
  formatDateTime,
  formatDuration,
  formatLocalDate,
  formatLocalDateLong,
  formatTime,
  t,
  warningMessage,
} from '../../i18n';
import { useData, useNow, useStore } from '../../state/store';
import { historyText } from './adminFormat';
import { ReservationFormDialog } from './ReservationForm';

const ad = t.admin;

type DialogState =
  | { kind: 'none' }
  | { kind: Exclude<ReservationAction, 'edit'>; id: string }
  | { kind: 'form'; mode: 'create'; prefill?: Partial<ReservationDraft> }
  | { kind: 'form'; mode: 'edit'; id: string };

interface Feedback {
  reservationId: string;
  message: string;
  warnings: DomainWarning[];
}

interface AdminActionsValue {
  openReservation: (id: string) => void;
  startAction: (action: ReservationAction, id: string) => void;
  createReservation: (prefill?: Partial<ReservationDraft>) => void;
}

const AdminActionsContext = createContext<AdminActionsValue | null>(null);

export function useAdminActions(): AdminActionsValue {
  const value = useContext(AdminActionsContext);
  if (!value) throw new Error('AdminActionsProvider ausente.');
  return value;
}

/**
 * Centraliza detalhes e ações das reservas para todas as telas administrativas:
 * cada ação passa por confirmação e é revalidada com os dados mais recentes.
 */
export function AdminActionsProvider({ children }: { children: ReactNode }) {
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const notify = useToast();

  const closeDialog = useCallback(() => setDialog({ kind: 'none' }), []);
  const report = useCallback(
    (reservationId: string, message: string, warnings: DomainWarning[] = []) => {
      setFeedback({ reservationId, message, warnings });
      notify({
        tone: warnings.length ? 'warning' : 'success',
        title: message,
        description: warnings.map(warningMessage).join(' ') || undefined,
      });
    },
    [notify],
  );

  const value = useMemo<AdminActionsValue>(
    () => ({
      openReservation: (id) => {
        setFeedback(null);
        setDrawerId(id);
      },
      startAction: (action, id) => setDialog(action === 'edit' ? { kind: 'form', mode: 'edit', id } : { kind: action, id }),
      createReservation: (prefill) => setDialog({ kind: 'form', mode: 'create', prefill }),
    }),
    [],
  );

  return (
    <AdminActionsContext.Provider value={value}>
      {children}
      <ReservationDrawer
        id={drawerId}
        feedback={feedback}
        onClose={() => {
          setDrawerId(null);
          setFeedback(null);
        }}
        onAction={(action, id) => {
          setFeedback(null);
          value.startAction(action, id);
        }}
      />
      {dialog.kind === 'arrive' && (
        <ArriveDialog id={dialog.id} onClose={closeDialog} report={report} onChangeTable={() => setDialog({ kind: 'changeTable', id: dialog.id })} />
      )}
      {dialog.kind === 'complete' && <CompleteDialog id={dialog.id} onClose={closeDialog} report={report} />}
      {dialog.kind === 'endPrep' && <EndPrepDialog id={dialog.id} onClose={closeDialog} report={report} />}
      {dialog.kind === 'extendPrep' && <ExtendPrepDialog id={dialog.id} onClose={closeDialog} report={report} />}
      {dialog.kind === 'cancel' && <CancelDialog id={dialog.id} onClose={closeDialog} report={report} />}
      {dialog.kind === 'noShow' && <NoShowDialog id={dialog.id} onClose={closeDialog} report={report} />}
      {dialog.kind === 'changeTable' && <ChangeTableDialog id={dialog.id} onClose={closeDialog} report={report} />}
      {dialog.kind === 'form' && (
        <ReservationFormDialog
          mode={dialog.mode}
          reservationId={dialog.mode === 'edit' ? dialog.id : undefined}
          prefill={dialog.mode === 'create' ? dialog.prefill : undefined}
          onClose={closeDialog}
          onSaved={(reservation, message) => {
            closeDialog();
            setFeedback({ reservationId: reservation.id, message, warnings: [] });
            setDrawerId(reservation.id);
          }}
        />
      )}
    </AdminActionsContext.Provider>
  );
}

type Report = (reservationId: string, message: string, warnings?: DomainWarning[]) => void;

function useReservation(id: string): Reservation | undefined {
  return useData().reservations.find((r) => r.id === id);
}

/* ---------- Painel da reserva ---------- */

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function ReservationDrawer({
  id,
  feedback,
  onClose,
  onAction,
}: {
  id: string | null;
  feedback: Feedback | null;
  onClose: () => void;
  onAction: (action: ReservationAction, id: string) => void;
}) {
  const data = useData();
  const now = useNow(15_000);
  const reservation = id ? data.reservations.find((r) => r.id === id) : undefined;

  if (!id) return <Dialog open={false} onClose={onClose} title="" variant="drawer" />;
  if (!reservation) {
    return (
      <Dialog open onClose={onClose} title={ad.layout.nav.reservations} variant="drawer">
        <Notice tone="warning">{ad.drawer.notFound}</Notice>
      </Dialog>
    );
  }

  const r = reservation;
  const table = data.tables.find((tb) => tb.id === r.tableId);
  const start = toMs(r.startAt);
  const states = getActionStates(data, r, now);
  const prepEnd = prepEndMs(r);
  const prepActive = isPrepActive(r, now);
  const lateMinutes = r.status === 'confirmed' && now > start ? Math.floor((now - start) / MINUTE_MS) : 0;
  const overdueMinutes = r.status === 'seated' && now > plannedServiceEnd(r) ? Math.floor((now - plannedServiceEnd(r)) / MINUTE_MS) : 0;

  const button = (action: ReservationAction, label: string, icon: ReactNode, variant = '') =>
    states[action].allowed ? (
      <button type="button" className={`btn ${variant}`} onClick={() => onAction(action, r.id)}>
        {icon}
        {label}
      </button>
    ) : null;

  return (
    <Dialog
      open
      onClose={onClose}
      variant="drawer"
      title={ad.drawer.title(r.customer.name)}
      description={`${r.code} · ${formatLocalDateLong(parisDate(start))} · ${formatTime(start)}`}
    >
      <div className="drawer-badges">
        <ReservationStatusBadge status={r.status} />
        <SourceLabel source={r.source} />
      </div>

      {feedback?.reservationId === r.id && (
        <Notice tone={feedback.warnings.length ? 'warning' : 'success'} role="status" title={feedback.message}>
          {feedback.warnings.length > 0 && (
            <ul>
              {feedback.warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}>{warningMessage(warning)}</li>
              ))}
            </ul>
          )}
        </Notice>
      )}
      {lateMinutes > 0 && <Notice tone={now >= noShowAvailableAt(data, r) ? 'warning' : 'info'}>{ad.drawer.late(lateMinutes)}</Notice>}
      {overdueMinutes > 0 && <Notice tone="warning">{ad.drawer.overdue(overdueMinutes)}</Notice>}
      {prepActive && prepEnd && <Notice tone="info">{ad.drawer.prepActive(formatTime(prepEnd))}</Notice>}

      <section className="drawer-section" aria-label={ad.actions.moreActions}>
        <div className="drawer-actions">
          {button('arrive', ad.actions.arrive, <LogIn aria-hidden="true" />, 'btn--primary')}
          {button('complete', ad.actions.complete, <UserCheck aria-hidden="true" />, 'btn--primary')}
          {button('endPrep', ad.actions.endPrep, <Sparkles aria-hidden="true" />, 'btn--primary')}
          {button('extendPrep', ad.actions.extendPrep, <Hourglass aria-hidden="true" />)}
          {button('changeTable', ad.actions.changeTable, <ArrowLeftRight aria-hidden="true" />)}
          {button('edit', ad.actions.edit, <Pencil aria-hidden="true" />)}
          {button('noShow', ad.actions.noShow, <UserX aria-hidden="true" />, 'btn--danger-soft')}
          {button('cancel', ad.actions.cancel, <CircleX aria-hidden="true" />, 'btn--danger-soft')}
        </div>
        {r.status === 'confirmed' && !states.arrive.allowed && states.arrive.error && (
          <p className="field__hint">
            {ad.actions.arrive}: {errorMessage(states.arrive.error)}
          </p>
        )}
        {r.status === 'confirmed' && !states.noShow.allowed && (
          <p className="field__hint">{ad.drawer.noShowFrom(formatTime(noShowAvailableAt(data, r)))}</p>
        )}
        {!states.edit.allowed && <p className="field__hint">{ad.drawer.lockedEdit}</p>}
      </section>

      <section className="drawer-section">
        <h3 className="drawer-section__title">{ad.layout.nav.reservations}</h3>
        <dl className="definition-list">
          <DetailRow label={ad.drawer.code}>
            <span className="num">{r.code}</span>
          </DetailRow>
          <DetailRow label={ad.drawer.date}>{formatLocalDateLong(parisDate(start))}</DetailRow>
          <DetailRow label={ad.drawer.planned}>
            <span className="num">
              {ad.drawer.plannedValue(formatTime(start), formatTime(plannedServiceEnd(r)), formatTime(plannedBlockEnd(r)))}
            </span>
          </DetailRow>
          <DetailRow label={ad.drawer.people}>{t.common.people(r.partySize)}</DetailRow>
          <DetailRow label={ad.drawer.table}>
            {table ? ad.drawer.tableValue(table.id, t.area[table.area], table.capacity) : r.tableId}
          </DetailRow>
          <DetailRow label={ad.drawer.durations}>
            {ad.drawer.durationsValue(formatDuration(r.serviceMinutes), formatDuration(r.prepMinutes))}
          </DetailRow>
          <DetailRow label={ad.drawer.createdAt}>{formatDateTime(toMs(r.createdAt))}</DetailRow>
          <DetailRow label={ad.drawer.email}>{r.customer.email || ad.drawer.noValue}</DetailRow>
          <DetailRow label={ad.drawer.phone}>{r.customer.phone || ad.drawer.noValue}</DetailRow>
          <DetailRow label={ad.drawer.notes}>{r.customer.notes || ad.drawer.noValue}</DetailRow>
        </dl>
      </section>

      {(r.seatedAt || r.cancelledAt || r.noShowAt) && (
        <section className="drawer-section">
          <h3 className="drawer-section__title">{ad.drawer.realTitle}</h3>
          <dl className="definition-list">
            {r.seatedAt && <DetailRow label={ad.drawer.seatedAt}>{formatDateTime(toMs(r.seatedAt))}</DetailRow>}
            {r.completedAt && <DetailRow label={ad.drawer.completedAt}>{formatDateTime(toMs(r.completedAt))}</DetailRow>}
            {prepEnd && (
              <DetailRow label={ad.drawer.prepEnd}>
                {formatTime(prepEnd)}
                {r.prepExtensionMinutes > 0 && <span className="subtle"> ({ad.drawer.prepExtension(r.prepExtensionMinutes)})</span>}
              </DetailRow>
            )}
            {r.cancelledAt && (
              <>
                <DetailRow label={ad.drawer.cancelledAt}>{formatDateTime(toMs(r.cancelledAt))}</DetailRow>
                <DetailRow label={ad.drawer.cancelledBy}>{r.cancelledBy ? t.actor[r.cancelledBy] : t.common.none}</DetailRow>
                {r.cancelReason && <DetailRow label={ad.drawer.reason}>{r.cancelReason}</DetailRow>}
              </>
            )}
            {r.noShowAt && <DetailRow label={ad.drawer.noShowAt}>{formatDateTime(toMs(r.noShowAt))}</DetailRow>}
          </dl>
        </section>
      )}

      <section className="drawer-section">
        <h3 className="drawer-section__title">{t.history.title}</h3>
        {r.history.length === 0 ? (
          <p className="subtle">{t.history.empty}</p>
        ) : (
          <ol className="history">
            {r.history.map((entry, index) => {
              const text = historyText(entry);
              return (
                <li className="history__item" key={`${entry.at}-${index}`}>
                  <span className="history__when num">
                    {formatDateTime(toMs(entry.at))} · {t.actor[entry.actor]}
                  </span>
                  <span>{text.title}</span>
                  {text.details.map((detail) => (
                    <span className="history__detail" key={detail}>
                      {detail}
                    </span>
                  ))}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </Dialog>
  );
}

/* ---------- Diálogos de ação ---------- */

function ArriveDialog({ id, onClose, report, onChangeTable }: { id: string; onClose: () => void; report: Report; onChangeTable: () => void }) {
  const data = useData();
  const store = useStore();
  const now = useNow(15_000);
  const r = useReservation(id);
  const [errors, setErrors] = useState<DomainError[]>([]);
  if (!r) return null;
  const check = checkArrival(data, r, now);

  if (!check.ok) {
    return (
      <Dialog
        open
        onClose={onClose}
        title={ad.dialogs.arriveBlockedTitle}
        footer={
          <>
            <button type="button" className="btn" onClick={onClose}>
              {t.common.back}
            </button>
            {check.errors.some((e) => e.code === 'TABLE_BUSY_NOW') && (
              <button type="button" className="btn btn--primary" onClick={onChangeTable}>
                <ArrowLeftRight aria-hidden="true" />
                {ad.actions.changeTable}
              </button>
            )}
          </>
        }
      >
        <InlineErrors errors={check.errors} />
        {check.errors.some((e) => e.code === 'TABLE_BUSY_NOW') && <p className="muted">{ad.dialogs.arriveBlockedHint}</p>}
      </Dialog>
    );
  }

  return (
    <ConfirmDialog
      open
      title={ad.dialogs.arriveTitle}
      description={ad.dialogs.arriveText(r.customer.name, r.tableId, formatTime(toMs(r.startAt)))}
      confirmLabel={ad.dialogs.arriveConfirm}
      errors={errors}
      onClose={onClose}
      onConfirm={() => {
        const result = store.execute((fresh, nowMs) => registerArrival(fresh, id, nowMs));
        if (!result.ok) return setErrors(result.errors);
        onClose();
        report(id, ad.toasts.arrived(r.customer.name), result.warnings);
      }}
    >
      <WarningList warnings={check.warnings} />
    </ConfirmDialog>
  );
}

function CompleteDialog({ id, onClose, report }: { id: string; onClose: () => void; report: Report }) {
  const store = useStore();
  const now = useNow(15_000);
  const r = useReservation(id);
  const [errors, setErrors] = useState<DomainError[]>([]);
  if (!r) return null;
  return (
    <ConfirmDialog
      open
      title={ad.dialogs.completeTitle}
      description={ad.dialogs.completeText(r.tableId, formatDuration(r.prepMinutes), formatTime(now + r.prepMinutes * MINUTE_MS))}
      confirmLabel={ad.dialogs.completeConfirm}
      errors={errors}
      onClose={onClose}
      onConfirm={() => {
        const result = store.execute((fresh, nowMs) => completeService(fresh, id, nowMs));
        if (!result.ok) return setErrors(result.errors);
        onClose();
        report(id, ad.toasts.completed(r.tableId, formatTime(prepEndMs(result.value.reservation) ?? now)), result.warnings);
      }}
    />
  );
}

function EndPrepDialog({ id, onClose, report }: { id: string; onClose: () => void; report: Report }) {
  const store = useStore();
  const r = useReservation(id);
  const [errors, setErrors] = useState<DomainError[]>([]);
  if (!r) return null;
  const prepEnd = prepEndMs(r);
  return (
    <ConfirmDialog
      open
      title={ad.dialogs.endPrepTitle}
      description={ad.dialogs.endPrepText(r.tableId, prepEnd ? formatTime(prepEnd) : t.common.none)}
      confirmLabel={ad.dialogs.endPrepConfirm}
      errors={errors}
      onClose={onClose}
      onConfirm={() => {
        const result = store.execute((fresh, nowMs) => endPrepEarly(fresh, id, nowMs));
        if (!result.ok) return setErrors(result.errors);
        onClose();
        report(id, ad.toasts.prepEnded(r.tableId));
      }}
    />
  );
}

function ExtendPrepDialog({ id, onClose, report }: { id: string; onClose: () => void; report: Report }) {
  const store = useStore();
  const r = useReservation(id);
  const [minutes, setMinutes] = useState(10);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<DomainError[]>([]);
  if (!r) return null;
  const prepEnd = prepEndMs(r) ?? 0;
  const reasonError = errors.find((e) => e.field === 'reason');
  const options: number[] = [];
  for (let m = LIMITS.prepExtension.min; m <= LIMITS.prepExtension.max; m += LIMITS.prepExtension.step) options.push(m);

  return (
    <ConfirmDialog
      open
      title={ad.dialogs.extendTitle}
      description={ad.dialogs.extendText(r.tableId, formatTime(prepEnd))}
      confirmLabel={ad.dialogs.extendConfirm}
      errors={errors.filter((e) => e.field !== 'reason')}
      onClose={onClose}
      onConfirm={() => {
        const result = store.execute((fresh, nowMs) => extendPrep(fresh, id, minutes, reason, nowMs));
        if (!result.ok) return setErrors(result.errors);
        onClose();
        report(id, ad.toasts.prepExtended(r.tableId, formatTime(prepEndMs(result.value.reservation) ?? prepEnd)));
      }}
    >
      <div className="form-grid form-grid--2">
        <Field id="extend-minutes" label={ad.dialogs.extendMinutes} hint={ad.dialogs.extendPreview(formatTime(prepEnd + minutes * MINUTE_MS))}>
          <select
            id="extend-minutes"
            className="select"
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            aria-describedby="extend-minutes-hint"
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option} min
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="extend-reason"
          label={ad.dialogs.extendReason}
          hint={ad.dialogs.extendReasonHint}
          error={reasonError ? errorMessage(reasonError) : null}
          className="span-all"
        >
          <textarea
            id="extend-reason"
            className="textarea"
            maxLength={LIMITS.reasonLength.max}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={Boolean(reasonError)}
            aria-describedby={describedBy('extend-reason', ad.dialogs.extendReasonHint, reasonError ? 'x' : null)}
          />
        </Field>
      </div>
    </ConfirmDialog>
  );
}

function CancelDialog({ id, onClose, report }: { id: string; onClose: () => void; report: Report }) {
  const store = useStore();
  const r = useReservation(id);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<DomainError[]>([]);
  if (!r) return null;
  const start = toMs(r.startAt);
  const reasonError = errors.find((e) => e.field === 'reason');
  return (
    <ConfirmDialog
      open
      tone="danger"
      title={ad.dialogs.cancelTitle}
      description={ad.dialogs.cancelText(r.customer.name, formatLocalDate(parisDate(start)), formatTime(start))}
      confirmLabel={ad.dialogs.cancelConfirm}
      confirmDisabled={reason.trim().length < LIMITS.reasonLength.min}
      errors={errors.filter((e) => e.field !== 'reason')}
      onClose={onClose}
      onConfirm={() => {
        const result = store.execute((fresh, nowMs) => cancelByAdmin(fresh, id, reason, nowMs));
        if (!result.ok) return setErrors(result.errors);
        onClose();
        report(id, ad.toasts.cancelled);
      }}
    >
      <Field
        id="cancel-reason"
        label={ad.dialogs.cancelReason}
        hint={`${ad.dialogs.cancelReasonHint} ${t.common.characters(reason.length, LIMITS.reasonLength.max)}`}
        error={reasonError ? errorMessage(reasonError) : null}
      >
        <textarea
          id="cancel-reason"
          className="textarea"
          maxLength={LIMITS.reasonLength.max}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={Boolean(reasonError)}
          aria-describedby="cancel-reason-hint"
        />
      </Field>
    </ConfirmDialog>
  );
}

function NoShowDialog({ id, onClose, report }: { id: string; onClose: () => void; report: Report }) {
  const data = useData();
  const store = useStore();
  const now = useNow(15_000);
  const r = useReservation(id);
  const [errors, setErrors] = useState<DomainError[]>([]);
  if (!r) return null;
  const tooEarly = now < noShowAvailableAt(data, r);
  return (
    <ConfirmDialog
      open
      tone="danger"
      title={ad.dialogs.noShowTitle}
      description={ad.dialogs.noShowText(r.customer.name, formatTime(toMs(r.startAt)), data.settings.rules.arrivalToleranceMinutes)}
      confirmLabel={ad.dialogs.noShowConfirm}
      confirmDisabled={tooEarly}
      errors={errors}
      onClose={onClose}
      onConfirm={() => {
        const result = store.execute((fresh, nowMs) => markNoShow(fresh, id, nowMs));
        if (!result.ok) return setErrors(result.errors);
        onClose();
        report(id, ad.toasts.noShow);
      }}
    >
      {tooEarly && <Notice tone="warning">{ad.drawer.noShowFrom(formatTime(noShowAvailableAt(data, r)))}</Notice>}
    </ConfirmDialog>
  );
}

function ChangeTableDialog({ id, onClose, report }: { id: string; onClose: () => void; report: Report }) {
  const data = useData();
  const store = useStore();
  const now = useNow(15_000);
  const r = useReservation(id);
  const [selected, setSelected] = useState('');
  const [errors, setErrors] = useState<DomainError[]>([]);
  if (!r) return null;

  const interval =
    r.status === 'seated'
      ? { start: now, end: projectedServiceEnd(r, now) + r.prepMinutes * MINUTE_MS }
      : plannedInterval(r);
  const options = data.tables
    .filter((table) => table.active && table.capacity >= r.partySize)
    .sort((a, b) => a.capacity - b.capacity || a.id.localeCompare(b.id, 'en', { numeric: true }))
    .map((table) => ({
      table,
      current: table.id === r.tableId,
      conflicts:
        table.id === r.tableId
          ? []
          : findConflicts(segmentsForTable(data, table.id, now, { excludeReservationId: r.id, relevantFrom: interval.start }), interval),
    }));
  const others = options.filter((option) => !option.current);

  return (
    <Dialog
      open
      onClose={onClose}
      title={ad.dialogs.changeTableTitle}
      description={ad.dialogs.changeTableText(r.partySize, `${formatTime(interval.start)}–${formatTime(interval.end)}`)}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.back}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!selected}
            onClick={() => {
              const result = store.execute((fresh, nowMs) => changeTable(fresh, id, selected, nowMs));
              if (!result.ok) return setErrors(result.errors);
              onClose();
              report(id, ad.toasts.tableChanged(r.tableId, selected));
            }}
          >
            {ad.dialogs.changeTableConfirm}
          </button>
        </>
      }
    >
      {others.length === 0 ? (
        <Notice tone="warning">{ad.dialogs.noOtherTables}</Notice>
      ) : (
        <fieldset className="booking-fieldset" style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend className="field__label">{ad.dialogs.chooseTable}</legend>
          <ul className="table-options">
            {options.map(({ table, current, conflicts }) => (
              <li className="table-option" key={table.id}>
                <input
                  type="radio"
                  name="change-table"
                  id={`change-table-${table.id}`}
                  value={table.id}
                  checked={selected === table.id}
                  disabled={current || conflicts.length > 0}
                  onChange={() => setSelected(table.id)}
                />
                <label className="table-option__face" htmlFor={`change-table-${table.id}`}>
                  <span>
                    <strong>{table.id}</strong> · {t.common.seats(table.capacity)} · {t.area[table.area]}
                  </span>
                  <span className={`badge ${current ? 'badge--neutral' : conflicts.length ? 'badge--occupied' : 'badge--free'}`}>
                    {current ? ad.dialogs.tableCurrent : conflicts.length ? ad.dialogs.tableBusy : ad.dialogs.tableFree}
                  </span>
                  {conflicts.length > 0 && <span className="field__hint">{conflictMessage(conflicts[0], data)}</span>}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <InlineErrors errors={errors} />
    </Dialog>
  );
}
