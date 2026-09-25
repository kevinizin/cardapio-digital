import { Download, RotateCcw } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DateField, TimeSelect, timeOptions } from '../../components/DateField';
import { InlineErrors, Notice, useToast, WarningList } from '../../components/Feedback';
import { describedBy, Field } from '../../components/Field';
import { useDocumentTitle } from '../../components/PageLoading';
import { clearBookingDraft, downloadTextFile } from '../../data/browser';
import { maxActiveCapacity } from '../../domain/availability';
import { createBlock, releaseBlock } from '../../domain/blocks';
import { LIMITS } from '../../domain/defaults';
import type { DomainError, DomainWarning } from '../../domain/errors';
import { generateId } from '../../domain/ids';
import { isSharedTable } from '../../domain/occupancy';
import { currentWeeklyRules } from '../../domain/schedule';
import { removeException, saveException, saveRules, saveTables, saveWeeklySchedule } from '../../domain/settingsRules';
import { MINUTE_MS, parisDate, parisTime, toMs } from '../../domain/time';
import type { BookingRules, DateException, ShiftConfig, WeeklyRules } from '../../domain/types';
import { errorMessage, formatDateTime, formatLocalDate, formatLocalDateCompact, formatTime, t } from '../../i18n';
import { useData, useNow, useSnapshot, useStore } from '../../state/store';
import { useAdminActions } from './AdminActions';
import { PageHead } from './AdminLayout';
import { placeOf } from './adminFormat';
import './settings.css';

const s = t.admin.settings;
const TIMES_15 = timeOptions(0, 23 * 60 + 45, 15);

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="card settings-section" aria-labelledby={`${id}-title`}>
      <header className="card__header">
        <div className="stack" style={{ '--stack-gap': '0.2rem' } as React.CSSProperties}>
          <h2 className="card__title" id={`${id}-title`}>
            {title}
          </h2>
          {intro && <p className="card__subtitle">{intro}</p>}
        </div>
      </header>
      <div className="card__body stack">{children}</div>
    </section>
  );
}

/** Reservas que impedem salvar, com atalho para resolver cada uma. */
function ConflictList({ ids }: { ids: string[] }) {
  const data = useData();
  const actions = useAdminActions();
  return (
    <Notice tone="warning" title={t.admin.conflicts.title}>
      <p>{s.conflictsIntro}</p>
      <ul className="conflict-list">
        {ids.map((id) => {
          const r = data.reservations.find((item) => item.id === id);
          if (!r) return null;
          const start = toMs(r.startAt);
          return (
            <li key={id}>
              <span>{t.admin.conflicts.row(r.customer.name, formatLocalDate(parisDate(start)), formatTime(start), placeOf(data.tables, r.tableId), r.partySize)}</span>
              <button type="button" className="btn btn--sm" onClick={() => actions.openReservation(id)}>
                {t.admin.conflicts.open}
              </button>
            </li>
          );
        })}
      </ul>
    </Notice>
  );
}

function Problems({ errors, inlineFields = [] }: { errors: DomainError[]; inlineFields?: string[] }) {
  const general = errors.filter((error) => !error.field || !inlineFields.some((prefix) => error.field?.startsWith(prefix)));
  return (
    <>
      <InlineErrors errors={general} />
      {errors
        .filter((error) => error.reservationIds?.length)
        .map((error) => (
          <ConflictList key={error.code} ids={error.reservationIds as string[]} />
        ))}
    </>
  );
}

/* ---------- Regras ---------- */

type RuleKey = Exclude<keyof BookingRules, 'phoneRequired'>;
const RULE_FIELDS: { key: RuleKey; range?: { min: number; max: number; step: number } }[] = [
  { key: 'serviceMinutes', range: LIMITS.serviceMinutes },
  { key: 'prepMinutes', range: LIMITS.prepMinutes },
  { key: 'slotIntervalMinutes' },
  { key: 'minAdvanceMinutes', range: LIMITS.minAdvanceMinutes },
  { key: 'bookingWindowDays', range: LIMITS.bookingWindowDays },
  { key: 'arrivalToleranceMinutes', range: LIMITS.arrivalToleranceMinutes },
  { key: 'customerCancelMinutes', range: LIMITS.customerCancelMinutes },
  { key: 'onlineMaxPartySize', range: LIMITS.onlineMaxPartySize },
];

function RulesSection() {
  const data = useData();
  const store = useStore();
  const notify = useToast();
  const [values, setValues] = useState<Record<RuleKey, string>>(
    () =>
      Object.fromEntries(RULE_FIELDS.map(({ key }) => [key, String(data.settings.rules[key])])) as Record<RuleKey, string>,
  );
  const [phoneRequired, setPhoneRequired] = useState(data.settings.rules.phoneRequired === true);
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [warnings, setWarnings] = useState<DomainWarning[]>([]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const numbers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)])) as Record<RuleKey, number>;
    const rules: BookingRules = { ...numbers, phoneRequired };
    const result = store.execute((fresh) => saveRules(fresh, rules));
    if (!result.ok) {
      setErrors(result.errors);
      setWarnings([]);
      return;
    }
    setErrors([]);
    setWarnings(result.warnings);
    notify({ tone: 'success', title: t.admin.toasts.saved });
  };

  const fieldError = (key: string) => {
    const error = errors.find((item) => item.field === key);
    return error ? errorMessage(error) : null;
  };

  return (
    <Section id="regras" title={s.sections.rules} intro={s.rules.intro}>
      <form noValidate onSubmit={save} className="stack">
        <div className="form-grid">
          {RULE_FIELDS.map(({ key, range }) => {
            const id = `rule-${key}`;
            const hint =
              key === 'customerCancelMinutes'
                ? s.rules.cancelHint(Number(values[key]) || 0)
                : key === 'onlineMaxPartySize'
                  ? s.rules.partyHint(maxActiveCapacity(data.tables))
                  : undefined;
            return (
              <Field key={key} id={id} label={s.rules[key]} hint={hint} error={fieldError(key)}>
                {key === 'slotIntervalMinutes' ? (
                  <select id={id} className="select" value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })}>
                    {LIMITS.slotIntervalOptions.map((option) => (
                      <option key={option} value={option}>
                        {option} min
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    className="input num"
                    type="number"
                    inputMode="numeric"
                    min={range?.min}
                    max={range?.max}
                    step={range?.step}
                    value={values[key]}
                    onChange={(event) => setValues({ ...values, [key]: event.target.value })}
                    aria-invalid={Boolean(fieldError(key))}
                    aria-describedby={describedBy(id, hint, fieldError(key))}
                  />
                )}
              </Field>
            );
          })}
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={phoneRequired} onChange={(event) => setPhoneRequired(event.target.checked)} />
          <span>{s.rules.phoneRequired}</span>
        </label>
        <p className="field__hint">{s.rules.phoneRequiredHint}</p>
        <Problems errors={errors} inlineFields={RULE_FIELDS.map((field) => field.key)} />
        <WarningList warnings={warnings} />
        <div className="section-actions">
          <button type="submit" className="btn btn--primary">
            {s.rules.save}
          </button>
        </div>
      </form>
    </Section>
  );
}

/* ---------- Funcionamento ---------- */

function ShiftEditor({ id, label, config, onChange, error }: { id: string; label: string; config: ShiftConfig; onChange: (patch: Partial<ShiftConfig>) => void; error?: DomainError }) {
  return (
    <div className="shift-editor">
      <label className="checkbox">
        <input type="checkbox" checked={config.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
        {s.weekly.open(label)}
      </label>
      <span className="shift-editor__times">
        <label className="visually-hidden" htmlFor={`${id}-start`}>
          {label}: {s.weekly.start}
        </label>
        <TimeSelect id={`${id}-start`} value={config.start} options={TIMES_15} onChange={(value) => onChange({ start: value })} disabled={!config.enabled} invalid={Boolean(error)} />
        <span aria-hidden="true">–</span>
        <label className="visually-hidden" htmlFor={`${id}-end`}>
          {label}: {s.weekly.end}
        </label>
        <TimeSelect id={`${id}-end`} value={config.end} options={TIMES_15} onChange={(value) => onChange({ end: value })} disabled={!config.enabled} invalid={Boolean(error)} />
      </span>
      {error && <p className="field__error">{errorMessage(error)}</p>}
    </div>
  );
}

function WeeklySection() {
  const data = useData();
  const store = useStore();
  const notify = useToast();
  const [weekly, setWeekly] = useState<WeeklyRules>(() => structuredClone(currentWeeklyRules(data.settings)));
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [warnings, setWarnings] = useState<DomainWarning[]>([]);

  const update = (day: number, kind: 'lunch' | 'dinner', patch: Partial<ShiftConfig>) =>
    setWeekly((current) => current.map((rule, index) => (index === day ? { ...rule, [kind]: { ...rule[kind], ...patch } } : rule)));

  const save = () => {
    const result = store.execute((fresh, nowMs) => saveWeeklySchedule(fresh, weekly, nowMs));
    if (!result.ok) {
      setErrors(result.errors);
      setWarnings([]);
      return;
    }
    setErrors([]);
    setWarnings(result.warnings);
    notify({ tone: 'success', title: t.admin.toasts.saved });
  };

  return (
    <Section id="funcionamento" title={s.sections.weekly} intro={s.weekly.intro}>
      <div className="weekly-list">
        {weekly.map((rule, day) => (
          <div className="weekly-row" key={t.weekdays[day]}>
            <span className="weekly-row__day">{t.weekdays[day]}</span>
            {(['lunch', 'dinner'] as const).map((kind) => (
              <ShiftEditor
                key={kind}
                id={`weekly-${day}-${kind}`}
                label={t.shift[kind]}
                config={rule[kind]}
                onChange={(patch) => update(day, kind, patch)}
                error={errors.find((error) => error.field === `weekly.${day}.${kind}`)}
              />
            ))}
          </div>
        ))}
      </div>
      <Problems errors={errors} inlineFields={['weekly.']} />
      <WarningList warnings={warnings} />
      <div className="section-actions">
        <button type="button" className="btn btn--primary" onClick={save}>
          {s.weekly.save}
        </button>
      </div>
    </Section>
  );
}

/* ---------- Exceções ---------- */

const emptyException = () => ({
  date: '',
  closed: true,
  lunch: { enabled: true, start: '12:00', end: '15:00' },
  dinner: { enabled: true, start: '19:00', end: '23:00' },
  note: '',
});

function describeException(exception: DateException): string {
  if (exception.closed) return s.exceptions.closedLabel;
  return (['lunch', 'dinner'] as const)
    .filter((kind) => exception[kind].enabled)
    .map((kind) => `${t.shift[kind]} ${exception[kind].start}–${exception[kind].end}`)
    .join(' · ');
}

function ExceptionsSection() {
  const data = useData();
  const store = useStore();
  const notify = useToast();
  const now = useNow(60_000);
  const today = parisDate(now);
  const [draft, setDraft] = useState(emptyException);
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removeErrors, setRemoveErrors] = useState<DomainError[]>([]);

  const upcoming = data.settings.exceptions.filter((exception) => exception.date >= today);
  const pastCount = data.settings.exceptions.length - upcoming.length;
  const toRemove = data.settings.exceptions.find((exception) => exception.id === removeId);

  const add = (event: FormEvent) => {
    event.preventDefault();
    const exception: DateException = { id: generateId('exc'), ...draft };
    const result = store.execute((fresh, nowMs) => saveException(fresh, exception, nowMs));
    if (!result.ok) return setErrors(result.errors);
    setErrors([]);
    setDraft(emptyException());
    notify({ tone: 'success', title: t.admin.toasts.saved });
  };

  const dateError = errors.find((error) => error.field === 'date');
  const noteError = errors.find((error) => error.field === 'note');
  const shiftError = errors.find((error) => error.field?.startsWith('exception.'));

  return (
    <Section id="excecoes" title={s.sections.exceptions} intro={s.exceptions.intro}>
      <div className="stack">
        <h3 className="drawer-section__title">{s.exceptions.upcoming}</h3>
        {upcoming.length === 0 ? (
          <p className="subtle">{s.exceptions.empty}</p>
        ) : (
          <ul className="conflict-list settings-list">
            {upcoming.map((exception) => (
              <li key={exception.id}>
                <span>
                  <strong>{formatLocalDateCompact(exception.date)}</strong> · {describeException(exception)}
                  {exception.note && <span className="subtle"> · {exception.note}</span>}
                </span>
                <button type="button" className="btn btn--sm btn--danger-soft" onClick={() => setRemoveId(exception.id)}>
                  {s.exceptions.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
        {pastCount > 0 && <p className="field__hint">{s.exceptions.past(pastCount)}</p>}
      </div>

      <form noValidate onSubmit={add} className="settings-subform stack">
        <h3 className="drawer-section__title">{s.exceptions.newTitle}</h3>
        <div className="form-grid">
          <Field id="exception-date" label={s.exceptions.date} error={dateError ? errorMessage(dateError) : null}>
            <DateField id="exception-date" value={draft.date} onChange={(value) => setDraft({ ...draft, date: value })} invalid={Boolean(dateError)} />
          </Field>
          <div className="field">
            <span className="field__label">{s.exceptions.closed}</span>
            <label className="checkbox">
              <input type="checkbox" checked={draft.closed} onChange={(event) => setDraft({ ...draft, closed: event.target.checked })} />
              {s.exceptions.closed}
            </label>
          </div>
        </div>
        {!draft.closed && (
          <div className="weekly-row weekly-row--compact">
            {(['lunch', 'dinner'] as const).map((kind) => (
              <ShiftEditor
                key={kind}
                id={`exception-${kind}`}
                label={t.shift[kind]}
                config={draft[kind]}
                onChange={(patch) => setDraft({ ...draft, [kind]: { ...draft[kind], ...patch } })}
                error={shiftError?.field === `exception.${kind}` ? shiftError : undefined}
              />
            ))}
          </div>
        )}
        <Field id="exception-note" label={s.exceptions.note} optional error={noteError ? errorMessage(noteError) : null}>
          <input
            id="exception-note"
            className="input"
            maxLength={LIMITS.exceptionNoteMaxLength}
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          />
        </Field>
        <Problems errors={errors} inlineFields={['date', 'note', 'exception.']} />
        <div className="section-actions">
          <button type="submit" className="btn btn--primary">
            {s.exceptions.save}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={Boolean(toRemove)}
        title={s.exceptions.removeTitle}
        description={toRemove ? s.exceptions.removeText(formatLocalDate(toRemove.date)) : ''}
        confirmLabel={s.exceptions.remove}
        tone="danger"
        onClose={() => {
          setRemoveId(null);
          setRemoveErrors([]);
        }}
        onConfirm={() => {
          if (!toRemove) return;
          const result = store.execute((fresh, nowMs) => removeException(fresh, toRemove.id, nowMs));
          if (!result.ok) return setRemoveErrors(result.errors);
          setRemoveId(null);
          notify({ tone: 'success', title: t.admin.toasts.saved });
        }}
      >
        {removeErrors.some((error) => error.reservationIds?.length) && <ConflictList ids={removeErrors.flatMap((error) => error.reservationIds ?? [])} />}
        <InlineErrors errors={removeErrors} />
      </ConfirmDialog>
    </Section>
  );
}

/* ---------- Mesas ---------- */

function TablesSection() {
  const data = useData();
  const store = useStore();
  const notify = useToast();
  const [rows, setRows] = useState(() =>
    data.tables.map((table) => ({
      id: table.id,
      area: table.area,
      shared: isSharedTable(table),
      capacity: String(table.capacity),
      active: table.active,
    })),
  );
  const [errors, setErrors] = useState<DomainError[]>([]);

  const activeRows = rows.filter((row) => row.active);
  const seats = activeRows.reduce((sum, row) => sum + (Number(row.capacity) || 0), 0);
  const onlyAreas = rows.length > 0 && rows.every((row) => row.shared);
  const anyArea = rows.some((row) => row.shared);

  const save = () => {
    const result = store.execute((fresh, nowMs) =>
      saveTables(fresh, rows.map((row) => ({ id: row.id, capacity: Number(row.capacity), active: row.active })), nowMs),
    );
    if (!result.ok) return setErrors(result.errors);
    setErrors([]);
    notify({ tone: 'success', title: t.admin.toasts.saved });
  };

  return (
    <Section id="mesas" title={s.sections.tables} intro={anyArea ? s.tables.introShared : s.tables.intro}>
      <div className="table-scroll">
        <table className="data-table settings-tables">
          <thead>
            <tr>
              <th scope="col">{onlyAreas ? s.tables.area : s.tables.table}</th>
              {!onlyAreas && <th scope="col">{s.tables.area}</th>}
              <th scope="col" className="settings-tables__wrap">{onlyAreas ? s.tables.capacityShared : s.tables.capacity}</th>
              <th scope="col">{s.tables.active}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const error = errors.find((item) => item.field === `tables.${row.id}.capacity`);
              const range = row.shared ? LIMITS.sharedCapacity : LIMITS.tableCapacity;
              const name = row.shared ? t.area[row.area] : row.id;
              return (
                <tr key={row.id}>
                  <th scope="row">
                    {name}
                    {row.shared && !onlyAreas && <span className="subtle settings-tables__kind"> · {s.tables.areaKind}</span>}
                  </th>
                  {!onlyAreas && <td>{t.area[row.area]}</td>}
                  <td>
                    <label className="visually-hidden" htmlFor={`table-capacity-${row.id}`}>
                      {row.shared ? s.tables.capacityShared : s.tables.capacity} {name}
                    </label>
                    <input
                      id={`table-capacity-${row.id}`}
                      className="input num settings-tables__capacity"
                      type="number"
                      inputMode="numeric"
                      min={range.min}
                      max={range.max}
                      value={row.capacity}
                      aria-invalid={Boolean(error)}
                      onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, capacity: event.target.value } : item)))}
                    />
                    {error && <p className="field__error">{errorMessage(error)}</p>}
                  </td>
                  <td>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={row.active}
                        onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, active: event.target.checked } : item)))}
                      />
                      <span className="visually-hidden">
                        {s.tables.active} {name}
                      </span>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="field__hint">
        {onlyAreas ? s.tables.totalsShared(seats, activeRows.length) : s.tables.totals(seats, activeRows.length)}
      </p>
      <Problems errors={errors} inlineFields={['tables.']} />
      <div className="section-actions">
        <button type="button" className="btn btn--primary" onClick={save}>
          {onlyAreas ? s.tables.saveShared : s.tables.save}
        </button>
      </div>
    </Section>
  );
}

/* ---------- Bloqueios ---------- */

function BlocksSection() {
  const data = useData();
  const store = useStore();
  const notify = useToast();
  const now = useNow(30_000);
  const [draft, setDraft] = useState(() => {
    const start = Math.ceil((now + MINUTE_MS) / (15 * MINUTE_MS)) * 15 * MINUTE_MS;
    const end = start + 2 * 60 * MINUTE_MS;
    return { tableId: data.tables[0]?.id ?? '', startDate: parisDate(start), startTime: parisTime(start), endDate: parisDate(end), endTime: parisTime(end), reason: '' };
  });
  const [errors, setErrors] = useState<DomainError[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  const active = data.blocks.filter((block) => toMs(block.endAt) > now).sort((a, b) => toMs(a.startAt) - toMs(b.startAt));
  const pastCount = data.blocks.length - active.length;
  const pendingBlock = data.blocks.find((block) => block.id === pending);
  const pendingOngoing = pendingBlock ? toMs(pendingBlock.startAt) <= now : false;

  const create = (event: FormEvent) => {
    event.preventDefault();
    const result = store.execute((fresh, nowMs) => createBlock(fresh, draft, nowMs));
    if (!result.ok) return setErrors(result.errors);
    setErrors([]);
    setDraft({ ...draft, reason: '' });
    notify({ tone: 'success', title: t.admin.toasts.blockCreated });
  };

  const error = (field: string) => {
    const item = errors.find((e) => e.field === field && e.code !== 'CONFLICT');
    return item ? errorMessage(item) : null;
  };

  return (
    <Section id="bloqueios" title={s.sections.blocks} intro={s.blocks.intro}>
      <form noValidate onSubmit={create} className="settings-subform stack">
        <div className="form-grid">
          <Field
            id="block-table"
            label={data.tables.every(isSharedTable) ? t.admin.agenda.colArea : data.tables.some(isSharedTable) ? s.blocks.tableOrArea : s.blocks.table}
            error={error('tableId')}
          >
            <select id="block-table" className="select" value={draft.tableId} onChange={(event) => setDraft({ ...draft, tableId: event.target.value })}>
              {data.tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {isSharedTable(table)
                    ? `${t.area[table.area]} · ${t.common.seats(table.capacity)}`
                    : `${table.id} · ${t.common.seats(table.capacity)} · ${t.area[table.area]}`}
                </option>
              ))}
            </select>
          </Field>
          <Field id="block-start-date" label={s.blocks.startDate} error={error('startDate')}>
            <DateField id="block-start-date" value={draft.startDate} onChange={(value) => setDraft({ ...draft, startDate: value })} />
          </Field>
          <Field id="block-start-time" label={s.blocks.startTime} error={error('startTime')}>
            <TimeSelect id="block-start-time" value={draft.startTime} options={TIMES_15} onChange={(value) => setDraft({ ...draft, startTime: value })} />
          </Field>
          <Field id="block-end-date" label={s.blocks.endDate} error={error('endDate')}>
            <DateField id="block-end-date" value={draft.endDate} onChange={(value) => setDraft({ ...draft, endDate: value })} />
          </Field>
          <Field id="block-end-time" label={s.blocks.endTime} error={error('endTime')}>
            <TimeSelect id="block-end-time" value={draft.endTime} options={TIMES_15} onChange={(value) => setDraft({ ...draft, endTime: value })} />
          </Field>
        </div>
        <Field id="block-reason" label={s.blocks.reason} error={error('reason')}>
          <input
            id="block-reason"
            className="input"
            maxLength={LIMITS.blockReasonLength.max}
            value={draft.reason}
            onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
          />
        </Field>
        <InlineErrors errors={errors.filter((e) => !e.field || e.code === 'CONFLICT')} />
        <div className="section-actions">
          <button type="submit" className="btn btn--primary">
            {s.blocks.create}
          </button>
        </div>
      </form>

      <div className="stack">
        <h3 className="drawer-section__title">{s.blocks.upcoming}</h3>
        {active.length === 0 ? (
          <p className="subtle">{s.blocks.empty}</p>
        ) : (
          <ul className="conflict-list settings-list">
            {active.map((block) => {
              const start = toMs(block.startAt);
              const ongoing = start <= now;
              return (
                <li key={block.id}>
                  <span>
                    <span className={`badge ${ongoing ? 'badge--blocked' : 'badge--neutral'}`}>{ongoing ? s.blocks.ongoing : s.blocks.scheduled}</span>{' '}
                    {s.blocks.item(placeOf(data.tables, block.tableId), `${formatDateTime(start)}–${formatDateTime(toMs(block.endAt))}`, block.reason)}
                  </span>
                  <button type="button" className="btn btn--sm btn--danger-soft" onClick={() => setPending(block.id)}>
                    {ongoing ? s.blocks.endNow : s.blocks.remove}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {pastCount > 0 && <p className="field__hint">{s.blocks.past(pastCount)}</p>}
      </div>

      <ConfirmDialog
        open={Boolean(pendingBlock)}
        title={pendingOngoing ? s.blocks.endTitle : s.blocks.removeTitle}
        description={pendingBlock ? s.blocks.item(placeOf(data.tables, pendingBlock.tableId), `${formatDateTime(toMs(pendingBlock.startAt))}–${formatDateTime(toMs(pendingBlock.endAt))}`, pendingBlock.reason) : ''}
        confirmLabel={pendingOngoing ? s.blocks.endNow : s.blocks.remove}
        tone="danger"
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (!pendingBlock) return;
          const result = store.execute((fresh, nowMs) => releaseBlock(fresh, pendingBlock.id, nowMs));
          setPending(null);
          if (result.ok) notify({ tone: 'success', title: result.value.outcome === 'removed' ? t.admin.toasts.blockRemoved : t.admin.toasts.blockEnded });
          else notify({ tone: 'error', title: errorMessage(result.errors[0]) });
        }}
      />
    </Section>
  );
}

/* ---------- Dados ---------- */

function DataSection() {
  const store = useStore();
  const snapshot = useSnapshot();
  const notify = useToast();
  const now = useNow(60_000);
  const [confirming, setConfirming] = useState(false);
  const { data, persistence } = snapshot;

  if (persistence.mode === 'remote') {
    return (
      <Section id="dados" title={s.sections.data} intro={s.data.remoteIntro}>
        <Notice tone={persistence.sync === 'offline' ? 'warning' : 'success'}>
          <p>{persistence.sync === 'offline' ? s.data.statusRemoteOffline : s.data.statusRemote}</p>
          <p className="subtle">{s.data.syncRemote}</p>
        </Notice>
        <p className="muted">
          {s.data.startedAt(formatDateTime(toMs(data.seededAt)))} {s.data.counts(data.reservations.length, data.blocks.length)}
        </p>
        <div className="cluster">
          <button
            type="button"
            className="btn"
            onClick={() => {
              downloadTextFile(s.data.jsonFile(parisDate(now)), store.exportJson(), 'application/json;charset=utf-8');
              notify({ tone: 'success', title: t.admin.toasts.exported });
            }}
          >
            <Download aria-hidden="true" />
            {s.data.exportJson}
          </button>
        </div>
      </Section>
    );
  }

  return (
    <Section id="dados" title={s.sections.data} intro={s.data.intro}>
      <Notice tone={persistence.mode === 'local' ? 'success' : 'warning'}>
        <p>{persistence.mode === 'local' ? s.data.statusLocal : s.data.statusMemory}</p>
        <p className="subtle">{s.data.sync}</p>
      </Notice>
      <p className="muted">
        {s.data.seededAt(formatDateTime(toMs(data.seededAt)))} {s.data.counts(data.reservations.length, data.blocks.length)}
      </p>
      <div className="cluster">
        <button
          type="button"
          className="btn"
          onClick={() => {
            downloadTextFile(s.data.jsonFile(parisDate(now)), store.exportJson(), 'application/json;charset=utf-8');
            notify({ tone: 'success', title: t.admin.toasts.exported });
          }}
        >
          <Download aria-hidden="true" />
          {s.data.exportJson}
        </button>
        <button type="button" className="btn btn--danger-soft" onClick={() => setConfirming(true)}>
          <RotateCcw aria-hidden="true" />
          {s.data.restore}
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={s.data.restoreTitle}
        description={s.data.restoreText}
        confirmLabel={s.data.restoreConfirm}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          store.restoreDemo();
          clearBookingDraft();
          setConfirming(false);
          notify({ tone: 'success', title: t.admin.toasts.restored });
        }}
      />
    </Section>
  );
}

export function SettingsPage() {
  useDocumentTitle(s.documentTitle);
  const data = useData();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [location.hash]);

  const sections: [string, string][] = [
    ['regras', s.sections.rules],
    ['funcionamento', s.sections.weekly],
    ['excecoes', s.sections.exceptions],
    ['mesas', s.sections.tables],
    ['bloqueios', s.sections.blocks],
    ['dados', s.sections.data],
  ];

  // Formulários são recriados ao restaurar a demonstração, para não exibir valores antigos.
  const key = data.seededAt;

  return (
    <>
      <PageHead title={s.title} description={s.subtitle} />
      <nav aria-label={s.sectionNav}>
        <ul className="settings-nav">
          {sections.map(([id, label]) => (
            <li key={id}>
              <a className="chip" href={`#${id}`}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="adm-grid">
        <RulesSection key={`rules-${key}`} />
        <WeeklySection key={`weekly-${key}`} />
        <ExceptionsSection key={`exceptions-${key}`} />
        <TablesSection key={`tables-${key}`} />
        <BlocksSection key={`blocks-${key}`} />
        <DataSection />
      </div>
    </>
  );
}
