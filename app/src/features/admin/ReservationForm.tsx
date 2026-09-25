import { Footprints } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { DateField, TimeSelect, timeOptions } from '../../components/DateField';
import { Dialog } from '../../components/Dialog';
import { InlineErrors, Notice, useToast } from '../../components/Feedback';
import { describedBy, Field } from '../../components/Field';
import { LIMITS } from '../../domain/defaults';
import { err, type DomainError } from '../../domain/errors';
import { isSharedTable, peakLoad, projectedServiceEnd, segmentsForTable, tableConflicts } from '../../domain/occupancy';
import {
  AUTO_TABLE,
  createReservation,
  draftFromReservation,
  updateReservation,
  type ReservationDraft,
} from '../../domain/reservations';
import { currentOrNextShift, getShiftsForDate } from '../../domain/schedule';
import { localToMs, MINUTE_MS, parisDate, parisMinutesOfDay, timeToMinutes } from '../../domain/time';
import { RESERVATION_SOURCES, type Reservation, type ReservationSource } from '../../domain/types';
import { errorMessage, formatTime, t } from '../../i18n';
import { useData, useNow, useStore } from '../../state/store';

const f = t.admin.form;

interface FormState {
  date: string;
  time: string;
  partySize: string;
  tableId: string;
  serviceMinutes: string;
  prepMinutes: string;
  source: ReservationSource;
  name: string;
  email: string;
  phone: string;
  notes: string;
}

interface Props {
  mode: 'create' | 'edit';
  reservationId?: string;
  prefill?: Partial<ReservationDraft>;
  onClose: () => void;
  onSaved: (reservation: Reservation, message: string) => void;
}

/** Criação manual (telefone, presencial) e edição com validação completa. */
export function ReservationFormDialog({ mode, reservationId, prefill, onClose, onSaved }: Props) {
  const data = useData();
  const store = useStore();
  const now = useNow(30_000);
  const notify = useToast();
  const { settings } = data;
  const original = reservationId ? data.reservations.find((r) => r.id === reservationId) : undefined;
  const seated = original?.status === 'seated';

  const [form, setForm] = useState<FormState>(() => {
    const base: ReservationDraft = original
      ? draftFromReservation(original)
      : {
          date: prefill?.date ?? currentOrNextShift(settings, now)?.shift.date ?? parisDate(now),
          time: prefill?.time ?? '',
          partySize: prefill?.partySize ?? 2,
          tableId: prefill?.tableId ?? AUTO_TABLE,
          serviceMinutes: settings.rules.serviceMinutes,
          prepMinutes: settings.rules.prepMinutes,
          customer: { name: '', email: '', phone: '', notes: '' },
          source: prefill?.source ?? 'phone',
        };
    return {
      date: base.date,
      time: base.time,
      partySize: String(base.partySize),
      tableId: base.tableId,
      serviceMinutes: String(base.serviceMinutes),
      prepMinutes: String(base.prepMinutes),
      source: base.source,
      name: base.customer.name,
      email: base.customer.email,
      phone: base.customer.phone,
      notes: base.customer.notes,
    };
  });
  const [errors, setErrors] = useState<DomainError[]>([]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const partySize = Number(form.partySize) || 0;
  const service = Number(form.serviceMinutes) || 0;
  const prep = Number(form.prepMinutes) || 0;
  const startMs = form.date && form.time ? localToMs(form.date, form.time) : null;
  const shifts = form.date ? getShiftsForDate(settings, form.date) : [];
  const times = shifts.flatMap((shift) =>
    timeOptions(timeToMinutes(shift.start), timeToMinutes(shift.end) - service - prep, 5),
  );
  const interval =
    startMs === null
      ? null
      : seated && original
        ? { start: now, end: projectedServiceEnd(original, now) + prep * MINUTE_MS }
        : { start: startMs, end: startMs + (service + prep) * MINUTE_MS };

  const tableChoices = useMemo(
    () =>
      data.tables.map((table) => {
        let note = '';
        if (!table.active) note = f.tableInactive;
        else if (partySize > 0 && table.capacity < partySize) note = f.tableSmall;
        else if (interval) {
          const segments = segmentsForTable(data, table.id, now, { excludeReservationId: original?.id, relevantFrom: interval.start });
          const conflicts = tableConflicts(table, segments, interval, Math.max(1, partySize));
          if (isSharedTable(table)) {
            note = conflicts.length ? f.areaFull : f.areaFree(Math.max(0, table.capacity - peakLoad(segments, interval, table.capacity)));
          } else note = conflicts.length ? f.tableBusy : f.tableFree;
        }
        return { table, note, disabled: (!table.active || (partySize > 0 && table.capacity < partySize)) && table.id !== original?.tableId };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, partySize, interval?.start, interval?.end, original?.id, original?.tableId],
  );

  const fieldErrors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const error of errors) if (error.field && !map[error.field]) map[error.field] = errorMessage(error);
    return map;
  }, [errors]);
  const sharedCount = data.tables.filter(isSharedTable).length;
  const onlyAreas = sharedCount > 0 && sharedCount === data.tables.length;
  const selectedShared = isSharedTable(data.tables.find((table) => table.id === form.tableId)) || (form.tableId === AUTO_TABLE && onlyAreas);
  const maxParty = Math.max(LIMITS.tableCapacity.max, ...data.tables.map((table) => table.capacity));
  const generalErrors = errors.filter((error) => !error.field || error.code === 'CONFLICT');

  const useNowPreset = () => {
    const today = parisDate(now);
    const minutes = Math.ceil((parisMinutesOfDay(now) + 1) / 5) * 5;
    const time = `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    setForm((current) => ({ ...current, date: today, time, source: 'walk_in' }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.date) {
      setErrors([err('DATE_INVALID', { field: 'date' })]);
      document.getElementById('res-date')?.focus();
      return;
    }
    const draft: ReservationDraft = {
      date: form.date,
      time: form.time,
      partySize,
      tableId: form.tableId,
      serviceMinutes: service,
      prepMinutes: prep,
      source: form.source,
      customer: { name: form.name, email: form.email, phone: form.phone, notes: form.notes },
    };
    if (mode === 'create') {
      const result = store.execute((fresh, nowMs) => createReservation(fresh, draft, nowMs, { channel: 'admin' }));
      if (!result.ok) return setErrors(result.errors);
      const message = t.admin.toasts.created(result.value.reservation.code);
      notify({ tone: 'success', title: message });
      onSaved(result.value.reservation, message);
      return;
    }
    if (!original) return;
    const result = store.execute((fresh, nowMs) => updateReservation(fresh, original.id, draft, nowMs));
    if (!result.ok) return setErrors(result.errors);
    const message = result.value.changes.length ? t.admin.toasts.updated : t.admin.toasts.noChanges;
    notify({ tone: result.value.changes.length ? 'success' : 'info', title: message });
    onSaved(result.value.reservation, message);
  };

  const invalid = (field: string) => Boolean(fieldErrors[field]);

  return (
    <Dialog
      open
      variant="wide"
      onClose={onClose}
      title={mode === 'create' ? f.createTitle : f.editTitle(original?.code ?? '')}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.back}
          </button>
          <button type="submit" form="reservation-form" className="btn btn--primary">
            {mode === 'create' ? f.submitCreate : f.submitEdit}
          </button>
        </>
      }
    >
      <form id="reservation-form" noValidate onSubmit={submit} className="stack">
        {mode === 'create' && (
          <div className="cluster">
            <button type="button" className="btn btn--sm" onClick={useNowPreset}>
              <Footprints aria-hidden="true" />
              {f.now}
            </button>
          </div>
        )}
        {seated && <Notice tone="info">{f.seatedLock}</Notice>}

        <div className="form-grid">
          <Field id="res-date" label={f.date} hint={f.dateHint} error={fieldErrors.date}>
            <DateField
              id="res-date"
              value={form.date}
              onChange={(value) => setForm((current) => ({ ...current, date: value }))}
              invalid={invalid('date')}
              describedBy={describedBy('res-date', f.dateHint, fieldErrors.date)}
              disabled={seated}
            />
          </Field>
          <Field id="res-time" label={f.time} hint={shifts.length ? f.timeHint : f.noShifts} error={fieldErrors.time}>
            <TimeSelect
              id="res-time"
              value={form.time}
              options={times}
              onChange={(value) => set('time', value)}
              invalid={invalid('time')}
              describedBy={describedBy('res-time', f.timeHint, fieldErrors.time)}
              disabled={seated}
            />
          </Field>
          <Field id="res-party" label={f.partySize} error={fieldErrors.partySize}>
            <input
              id="res-party"
              className="input num"
              type="number"
              inputMode="numeric"
              min={1}
              max={maxParty}
              value={form.partySize}
              onChange={(event) => set('partySize', event.target.value)}
              aria-invalid={invalid('partySize')}
              aria-describedby={describedBy('res-party', undefined, fieldErrors.partySize)}
            />
          </Field>
        </div>

        <div className="form-grid">
          <Field id="res-table" label={onlyAreas ? f.area : sharedCount ? f.tableOrArea : f.table} error={fieldErrors.tableId}>
            <select
              id="res-table"
              className="select"
              value={form.tableId}
              onChange={(event) => set('tableId', event.target.value)}
              aria-invalid={invalid('tableId')}
              aria-describedby={describedBy('res-table', undefined, fieldErrors.tableId)}
            >
              <option value={AUTO_TABLE}>{onlyAreas ? f.areaAuto : sharedCount ? f.autoMixed : f.tableAuto}</option>
              {tableChoices.map(({ table, note, disabled }) => (
                <option key={table.id} value={table.id} disabled={disabled}>
                  {isSharedTable(table)
                    ? f.areaOption(t.area[table.area], table.capacity, note || t.common.none)
                    : f.tableOption(table.id, table.capacity, t.area[table.area], note || t.common.none)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="res-source" label={f.source}>
            <select id="res-source" className="select" value={form.source} onChange={(event) => set('source', event.target.value as ReservationSource)}>
              {RESERVATION_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {t.source[source]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="form-grid">
          <Field id="res-service" label={f.serviceMinutes} error={fieldErrors.serviceMinutes}>
            <input
              id="res-service"
              className="input num"
              type="number"
              inputMode="numeric"
              step={LIMITS.serviceMinutes.step}
              min={LIMITS.serviceMinutes.min}
              max={LIMITS.serviceMinutes.max}
              value={form.serviceMinutes}
              disabled={seated}
              onChange={(event) => set('serviceMinutes', event.target.value)}
              aria-invalid={invalid('serviceMinutes')}
              aria-describedby="res-durations-hint"
            />
          </Field>
          <Field id="res-prep" label={f.prepMinutes} error={fieldErrors.prepMinutes}>
            <input
              id="res-prep"
              className="input num"
              type="number"
              inputMode="numeric"
              step={LIMITS.prepMinutes.step}
              min={LIMITS.prepMinutes.min}
              max={LIMITS.prepMinutes.max}
              value={form.prepMinutes}
              disabled={seated}
              onChange={(event) => set('prepMinutes', event.target.value)}
              aria-invalid={invalid('prepMinutes')}
              aria-describedby="res-durations-hint"
            />
          </Field>
        </div>
        <p className="field__hint" id="res-durations-hint">
          {f.durationHint(settings.rules.serviceMinutes, settings.rules.prepMinutes)}
          {startMs !== null && service > 0 && (
            <>
              {' '}
              {f.preview(formatTime(startMs), formatTime(startMs + service * MINUTE_MS), formatTime(startMs + (service + prep) * MINUTE_MS), selectedShared)}
            </>
          )}
        </p>

        <div className="form-grid">
          <Field id="res-name" label={f.name} error={fieldErrors.name}>
            <input
              id="res-name"
              className="input"
              maxLength={LIMITS.nameLength.max}
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              aria-invalid={invalid('name')}
              aria-describedby={describedBy('res-name', undefined, fieldErrors.name)}
            />
          </Field>
          <Field id="res-email" label={f.email} optional={form.source !== 'online'} hint={f.emailHint} error={fieldErrors.email}>
            <input
              id="res-email"
              className="input"
              type="email"
              maxLength={LIMITS.emailMaxLength}
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              aria-invalid={invalid('email')}
              aria-describedby={describedBy('res-email', f.emailHint, fieldErrors.email)}
            />
          </Field>
          <Field id="res-phone" label={f.phone} optional error={fieldErrors.phone}>
            <input
              id="res-phone"
              className="input"
              type="tel"
              maxLength={LIMITS.phoneMaxLength}
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              aria-invalid={invalid('phone')}
              aria-describedby={describedBy('res-phone', undefined, fieldErrors.phone)}
            />
          </Field>
        </div>
        <Field
          id="res-notes"
          label={f.notes}
          optional
          hint={t.common.characters(form.notes.length, LIMITS.notesMaxLength)}
          error={fieldErrors.notes}
        >
          <textarea
            id="res-notes"
            className="textarea"
            maxLength={LIMITS.notesMaxLength}
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
            aria-invalid={invalid('notes')}
            aria-describedby={describedBy('res-notes', 'x', fieldErrors.notes)}
          />
        </Field>

        <InlineErrors errors={generalErrors} />
      </form>
    </Dialog>
  );
}
