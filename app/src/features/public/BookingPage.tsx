import { Check, Moon, Sun } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ParisClock } from '../../components/Brand';
import { Calendar, type CalendarDayStatus } from '../../components/Calendar';
import { InlineErrors, Notice } from '../../components/Feedback';
import { describedBy, Field } from '../../components/Field';
import { useDocumentTitle } from '../../components/PageLoading';
import { clearBookingDraft, loadBookingDraft, rememberReservationCode, saveBookingDraft } from '../../data/browser';
import { findNextAvailableDates, getDayAvailability, summarizeDates, type SuggestedDate } from '../../domain/availability';
import { validateCustomer } from '../../domain/customer';
import { LIMITS } from '../../domain/defaults';
import type { DomainError, DomainErrorCode } from '../../domain/errors';
import { getDayStatus, lastBookableDate } from '../../domain/schedule';
import { daysOfMonth, localToMs, MINUTE_MS, monthOfDate, parisDate } from '../../domain/time';
import type { Customer, LocalDate, LocalTime } from '../../domain/types';
import { formatWhatsapp, hasContact, RESTAURANT_CONTACT, whatsappUrl } from '../../config/restaurant';
import { useI18n, useT } from '../../i18n';
import { useData, useNow, useStore } from '../../state/store';
import { ClosedDayExplain } from './ClosureNotice';
import { ContactList } from './PublicChrome';
const EMPTY_CUSTOMER: Customer = { name: '', email: '', phone: '', notes: '' };
const CUSTOMER_FIELDS = ['name', 'email', 'phone', 'notes'];
const SLOT_ERRORS = new Set<DomainErrorCode>([
  'SLOT_UNAVAILABLE',
  'START_IN_PAST',
  'MIN_ADVANCE',
  'DAY_CLOSED',
  'DAY_PAST',
  'BEYOND_WINDOW',
  'OUTSIDE_SHIFT',
  'OFF_GRID',
  'PARTY_ABOVE_ONLINE_LIMIT',
  'PARTY_ABOVE_CAPACITY',
]);

type Step = 0 | 1 | 2 | 3;

interface DraftState {
  step: Step;
  partySize: number;
  largeGroup: boolean;
  date: LocalDate | null;
  time: LocalTime | null;
  customer: Customer;
}

const INITIAL_DRAFT: DraftState = { step: 0, partySize: 2, largeGroup: false, date: null, time: null, customer: EMPTY_CUSTOMER };

/** Recupera o rascunho da sessão (recarregar a página não perde os dados). */
function restoreDraft(): DraftState {
  const raw = loadBookingDraft() as Partial<DraftState> | null;
  if (!raw || typeof raw !== 'object' || typeof raw.partySize !== 'number') return INITIAL_DRAFT;
  const customer = (raw.customer ?? {}) as Partial<Customer>;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    step: ([0, 1, 2, 3] as const).includes(raw.step as Step) ? (raw.step as Step) : 0,
    partySize: Math.max(1, Math.round(raw.partySize)),
    largeGroup: Boolean(raw.largeGroup),
    date: typeof raw.date === 'string' ? raw.date : null,
    time: typeof raw.time === 'string' ? raw.time : null,
    customer: {
      name: text(customer.name),
      email: text(customer.email),
      phone: text(customer.phone),
      notes: text(customer.notes),
      ...(customer.marketingOptIn === true ? { marketingOptIn: true } : {}),
    },
  };
}

function SummaryRow({ label, value, onEdit }: { label: string; value: ReactNode; onEdit?: () => void }) {
  const b = useT().public.booking;
  return (
    <div className="summary-row">
      <dt>{label}</dt>
      <dd className="cluster" style={{ justifyContent: 'space-between' }}>
        <span>{value}</span>
        {onEdit && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit} aria-label={`${b.edit}: ${label}`}>
            {b.edit}
          </button>
        )}
      </dd>
    </div>
  );
}

export function BookingPage() {
  const { t, f, errorMessage, locale } = useI18n();
  const { formatDuration, formatLocalDate, formatLocalDateCompact, formatLocalDateLong, formatParisOffset, formatTime } = f;
  const b = t.public.booking;
  useDocumentTitle(b.documentTitle);
  const data = useData();
  const store = useStore();
  const now = useNow(30_000);
  const navigate = useNavigate();
  const { settings } = data;
  const { rules } = settings;
  const phoneRequired = rules.phoneRequired === true;
  const nowMinute = Math.floor(now / MINUTE_MS);
  const today = parisDate(now);
  const lastDate = lastBookableDate(settings, now);

  const [draft, setDraft] = useState<DraftState>(restoreDraft);
  const [month, setMonth] = useState(() => monthOfDate(draft.date && draft.date >= today ? draft.date : today));
  const [customerErrors, setCustomerErrors] = useState<DomainError[]>([]);
  const [submitErrors, setSubmitErrors] = useState<DomainError[]>([]);
  const [slotTaken, setSlotTaken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Campo a focar na próxima troca de etapa (erro devolvido pelo servidor). */
  const focusFieldRef = useRef<string | null>(null);
  const isFirstStepRender = useRef(true);

  const partySize = Math.min(draft.partySize, rules.onlineMaxPartySize);
  const update = (patch: Partial<DraftState>) => setDraft((current) => ({ ...current, ...patch }));

  useEffect(() => saveBookingDraft(draft), [draft]);

  useEffect(() => {
    if (isFirstStepRender.current) {
      isFirstStepRender.current = false;
      return;
    }
    const field = focusFieldRef.current ? document.getElementById(`booking-${focusFieldRef.current}`) : null;
    focusFieldRef.current = null;
    (field ?? headingRef.current)?.focus();
  }, [draft.step]);

  // Rascunho antigo com data que já passou volta ao início do fluxo.
  useEffect(() => {
    if (draft.date && draft.date < today) setDraft((current) => ({ ...current, date: null, time: null, step: 0 }));
  }, [draft.date, today]);

  const monthDates = useMemo(() => daysOfMonth(month), [month]);
  const monthSummary = useMemo(
    () => (draft.largeGroup ? null : summarizeDates(data, monthDates, partySize, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, monthDates, partySize, draft.largeGroup, nowMinute],
  );
  const availability = useMemo(
    () => (draft.date && !draft.largeGroup ? getDayAvailability(data, draft.date, partySize, now, 'online') : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, draft.date, partySize, draft.largeGroup, nowMinute],
  );
  const dateStatus = draft.date ? getDayStatus(settings, draft.date, now) : null;
  const suggestions: SuggestedDate[] = useMemo(() => {
    if (!draft.date || draft.largeGroup || !availability || availability.totalSlots > 0) return [];
    if (dateStatus !== 'open' && dateStatus !== 'closed') return [];
    return findNextAvailableDates(data, draft.date, partySize, now, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, draft.date, partySize, draft.largeGroup, availability, dateStatus, nowMinute]);

  const slots = availability?.shifts.flatMap((shift) => shift.slots) ?? [];
  const selectedSlot = slots.find((slot) => slot.time === draft.time) ?? null;
  const fieldErrors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const error of customerErrors) if (error.field && !map[error.field]) map[error.field] = errorMessage(error);
    return map;
  }, [customerErrors, errorMessage]);

  const dayInfo = (date: LocalDate): { status: CalendarDayStatus; description: string } => {
    const entry = monthSummary?.get(date);
    const status = entry?.status ?? getDayStatus(settings, date, now);
    if (status === 'open') {
      return (entry?.totalSlots ?? 0) > 0
        ? { status: 'available', description: b.dayStatus.open(entry?.totalSlots ?? 0) }
        : { status: 'full', description: b.dayStatus.full };
    }
    return { status: 'unavailable', description: b.dayStatus[status] };
  };

  const chooseDate = (date: LocalDate) => {
    update({ date, time: null });
    setMonth(monthOfDate(date));
  };

  const suggestionList = suggestions.length ? (
    <ul className="suggestions">
      {suggestions.map((suggestion) => (
        <li key={suggestion.date}>
          <button type="button" className="btn" onClick={() => chooseDate(suggestion.date)}>
            <span>{b.suggestion(formatLocalDateCompact(suggestion.date), suggestion.firstSlot.time)}</span>
            <span className="subtle">{b.dayStatus.open(suggestion.totalSlots)}</span>
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="subtle">{b.noSuggestions}</p>
  );

  const dateExplanation = () => {
    if (!draft.date || !dateStatus) return <p className="field__hint">{b.chooseDate}</p>;
    const label = formatLocalDateLong(draft.date);
    if (dateStatus === 'past') return <Notice tone="warning" title={label}>{b.dateExplain.past}</Notice>;
    if (dateStatus === 'beyond_window') {
      return (
        <Notice tone="warning" title={label}>
          {b.dateExplain.beyond_window(rules.bookingWindowDays, formatLocalDate(lastDate))}
        </Notice>
      );
    }
    if (dateStatus === 'closed') {
      return (
        <Notice tone="warning" title={label}>
          <ClosedDayExplain date={draft.date} />
          <p className="notice__title">{b.otherDates}</p>
          {suggestionList}
        </Notice>
      );
    }
    if (!availability || availability.totalSlots === 0) {
      return (
        <Notice tone="warning" title={label}>
          <p>{b.dateExplain.full}</p>
          <p className="notice__title">{b.otherDates}</p>
          {suggestionList}
        </Notice>
      );
    }
    return (
      <Notice tone="success" title={b.selectedDate(label)}>
        {b.dayStatus.open(availability.totalSlots)}
      </Notice>
    );
  };

  const goToDetailsOrReview = () => {
    if (!selectedSlot) return;
    const valid = validateCustomer(draft.customer, { emailRequired: true, phoneRequired }).length === 0;
    update({ step: slotTaken && valid ? 3 : 2 });
  };

  const goToReview = () => {
    const errors = validateCustomer(draft.customer, { emailRequired: true, phoneRequired });
    setCustomerErrors(errors);
    if (errors.length) {
      document.getElementById(`booking-${errors[0].field}`)?.focus();
      return;
    }
    update({ step: 3 });
  };

  const confirm = () => {
    if (submittingRef.current || !draft.date || !draft.time) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitErrors([]);
    const input = { date: draft.date, time: draft.time, partySize, customer: draft.customer, locale };
    // O servidor revalida com os dados mais recentes antes de gravar.
    void store.createOnline(input).then((result) => {
      if (result.ok) {
        const { code } = result.value.reservation;
        rememberReservationCode(code);
        clearBookingDraft();
        navigate(`/reserva/${code}`, { replace: true });
        return;
      }
      submittingRef.current = false;
      setSubmitting(false);
      if (result.errors.some((error) => SLOT_ERRORS.has(error.code))) {
        setSlotTaken(true);
        setDraft((current) => ({ ...current, time: null, step: 1 }));
        return;
      }
      const customerProblems = result.errors.filter((error) => error.field && CUSTOMER_FIELDS.includes(error.field));
      if (customerProblems.length) {
        setCustomerErrors(customerProblems);
        focusFieldRef.current = customerProblems[0].field ?? null;
        update({ step: 2 });
        return;
      }
      setSubmitErrors(result.errors);
    });
  };

  const setCustomer = (field: 'name' | 'email' | 'phone' | 'notes', value: string) =>
    setDraft((current) => ({ ...current, customer: { ...current.customer, [field]: value } }));

  const startMs = draft.date && draft.time ? localToMs(draft.date, draft.time) : null;
  const step = draft.step;

  return (
    <div className="container">
      <header className="pub-page-head">
        <p className="eyebrow">{t.brand.name}</p>
        <h1>{b.heading}</h1>
        <p>{b.intro}</p>
        <ParisClock />
      </header>

      <div className="booking">
        <div>
          <ol className="stepper" aria-label={b.stepsLabel}>
            {b.steps.map((label, index) => (
              <li
                key={label}
                className={`stepper__item${index < step ? ' stepper__item--done' : ''}`}
                aria-current={index === step ? 'step' : undefined}
              >
                <span className="stepper__num">{index < step ? <Check aria-hidden="true" /> : index + 1}</span>
                <span className="stepper__label">{label}</span>
                {index < step && <span className="visually-hidden"> {b.stepDone}</span>}
              </li>
            ))}
          </ol>

          <section className="booking-panel" aria-labelledby="booking-step-title">
            <div>
              <p className="field__hint">{b.stepOf(step + 1, b.steps.length)}</p>
              <h2 id="booking-step-title" ref={headingRef} tabIndex={-1} className="booking-panel__title">
                {step === 0 ? b.steps[0] : step === 1 ? b.timeTitle : step === 2 ? b.detailsTitle : b.reviewTitle}
              </h2>
            </div>

            {step === 0 && (
              <>
                <fieldset className="booking-fieldset">
                  <legend>{b.partyLegend}</legend>
                  <div className="choice-grid">
                    {Array.from({ length: rules.onlineMaxPartySize }, (_, i) => i + 1).map((n) => (
                      <label className="choice" key={n}>
                        <input
                          type="radio"
                          name="booking-party"
                          value={n}
                          checked={!draft.largeGroup && partySize === n}
                          onChange={() => update({ partySize: n, largeGroup: false, time: null })}
                        />
                        <span className="choice__face">
                          {n}
                          <small>{b.partyUnit(n)}</small>
                        </span>
                      </label>
                    ))}
                    <label className="choice">
                      <input
                        type="radio"
                        name="booking-party"
                        value="large"
                        checked={draft.largeGroup}
                        onChange={() => update({ largeGroup: true, time: null })}
                      />
                      <span className="choice__face">{b.partyLarger(rules.onlineMaxPartySize)}</span>
                    </label>
                  </div>
                </fieldset>

                {draft.largeGroup ? (
                  <Notice tone="neutral" title={b.largerTitle}>
                    <p>{b.largerText(rules.onlineMaxPartySize, Boolean(RESTAURANT_CONTACT.whatsapp))}</p>
                    {hasContact() ? <ContactList /> : store.kind === 'demo' && <p className="subtle">{b.largerDemo}</p>}
                  </Notice>
                ) : (
                  <div className="booking-fieldset">
                    <h3 id="booking-date-legend" className="booking-fieldset__title">
                      {b.dateLegend}
                    </h3>
                    <Calendar
                      month={month}
                      onMonthChange={setMonth}
                      minMonth={monthOfDate(today)}
                      maxMonth={monthOfDate(lastDate)}
                      selected={draft.date}
                      today={today}
                      onSelect={chooseDate}
                      dayInfo={dayInfo}
                      labelledBy="booking-date-legend"
                    />
                    <div aria-live="polite">{dateExplanation()}</div>
                  </div>
                )}

                <div className="booking-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    disabled={draft.largeGroup || !availability || availability.totalSlots === 0}
                    onClick={() => update({ step: 1 })}
                  >
                    {b.continue}
                  </button>
                </div>
              </>
            )}

            {step === 1 && draft.date && (
              <>
                <div className="stack" style={{ '--stack-gap': '0.35rem' } as React.CSSProperties}>
                  <p className="notice__title">{b.timeSummary(formatLocalDateLong(draft.date), t.common.people(partySize))}</p>
                  <p className="muted">
                    {b.parisTimes(formatParisOffset(slots[0]?.startMs ?? now))} {b.duration(formatDuration(rules.serviceMinutes))}
                  </p>
                </div>

                {slotTaken && (
                  <Notice tone="warning" role="alert" title={b.slotTakenTitle}>
                    {b.slotTakenText}
                  </Notice>
                )}
                {!slotTaken && draft.time && !selectedSlot && <Notice tone="warning">{b.slotGone}</Notice>}

                {slots.length > 0 ? (
                  <div className="slot-groups">
                    {availability?.shifts
                      .filter((group) => group.slots.length > 0)
                      .map((group) => (
                        <fieldset className="slot-group" key={group.shift.kind}>
                          <legend className="slot-group__title">
                            {group.shift.kind === 'lunch' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                            {t.shift[group.shift.kind]}
                            <span className="subtle num">
                              ({group.shift.start}–{group.shift.end})
                            </span>
                          </legend>
                          <div className="slot-grid">
                            {group.slots.map((slot) => (
                              <label className="choice" key={slot.startMs}>
                                <input
                                  type="radio"
                                  name="booking-slot"
                                  value={slot.time}
                                  checked={draft.time === slot.time}
                                  onChange={() => update({ time: slot.time })}
                                  aria-label={b.slotAria(slot.time, t.shift[group.shift.kind])}
                                />
                                <span className="choice__face">{slot.time}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                  </div>
                ) : (
                  <Notice tone="warning" title={b.noSlotsTitle}>
                    <p>{b.noSlotsText}</p>
                    {suggestionList}
                  </Notice>
                )}

                <div className="booking-actions">
                  <button type="button" className="btn" onClick={() => update({ step: 0 })}>
                    {b.back}
                  </button>
                  <button type="button" className="btn btn--primary btn--lg" disabled={!selectedSlot} onClick={goToDetailsOrReview}>
                    {b.continue}
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <form
                noValidate
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  goToReview();
                }}
              >
                <div className="form-grid form-grid--2">
                  <Field id="booking-name" label={b.name} error={fieldErrors.name}>
                    <input
                      id="booking-name"
                      className="input"
                      autoComplete="name"
                      maxLength={LIMITS.nameLength.max}
                      value={draft.customer.name}
                      onChange={(event) => setCustomer('name', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={describedBy('booking-name', undefined, fieldErrors.name)}
                      required
                    />
                  </Field>
                  <Field id="booking-email" label={b.email} hint={b.emailHint} error={fieldErrors.email}>
                    <input
                      id="booking-email"
                      className="input"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      maxLength={LIMITS.emailMaxLength}
                      value={draft.customer.email}
                      onChange={(event) => setCustomer('email', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={describedBy('booking-email', b.emailHint, fieldErrors.email)}
                      required
                    />
                  </Field>
                  <Field id="booking-phone" label={b.phone} optional={!phoneRequired} hint={b.phoneHint} error={fieldErrors.phone}>
                    <input
                      id="booking-phone"
                      className="input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={LIMITS.phoneMaxLength}
                      value={draft.customer.phone}
                      onChange={(event) => setCustomer('phone', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={describedBy('booking-phone', b.phoneHint, fieldErrors.phone)}
                      required={phoneRequired}
                    />
                  </Field>
                  <Field
                    id="booking-notes"
                    label={b.notes}
                    optional
                    className="span-all"
                    hint={`${b.notesHint} ${t.common.characters(draft.customer.notes.length, LIMITS.notesMaxLength)}`}
                    error={fieldErrors.notes}
                  >
                    <textarea
                      id="booking-notes"
                      className="textarea"
                      maxLength={LIMITS.notesMaxLength}
                      value={draft.customer.notes}
                      onChange={(event) => setCustomer('notes', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.notes)}
                      aria-describedby={describedBy('booking-notes', b.notesHint, fieldErrors.notes)}
                    />
                  </Field>
                </div>
                <div className="stack" style={{ '--stack-gap': '0.25rem' } as React.CSSProperties}>
                  <label className="checkbox booking-optin">
                    <input
                      type="checkbox"
                      checked={draft.customer.marketingOptIn === true}
                      onChange={(event) =>
                        setDraft((current) => {
                          const { marketingOptIn: _previous, ...rest } = current.customer;
                          return { ...current, customer: event.target.checked ? { ...rest, marketingOptIn: true } : rest };
                        })
                      }
                      aria-describedby="booking-optin-hint"
                    />
                    <span>{b.marketingOptIn}</span>
                  </label>
                  <p className="field__hint" id="booking-optin-hint">
                    {b.marketingHint}
                  </p>
                </div>
                <p className="field__hint booking-privacy">
                  {b.privacyNote}{' '}
                  {RESTAURANT_CONTACT.whatsapp ? (
                    <>
                      {b.privacyDelete}{' '}
                      <a href={whatsappUrl(RESTAURANT_CONTACT.whatsapp)} target="_blank" rel="noopener noreferrer">
                        {formatWhatsapp(RESTAURANT_CONTACT.whatsapp)}
                      </a>
                    </>
                  ) : (
                    b.privacyDeleteGeneric
                  )}
                </p>
                <div className="booking-actions">
                  <button type="button" className="btn" onClick={() => update({ step: 1 })}>
                    {b.back}
                  </button>
                  <button type="submit" className="btn btn--primary btn--lg">
                    {b.continue}
                  </button>
                </div>
              </form>
            )}

            {step === 3 && draft.date && (
              <>
                <dl className="summary-list">
                  <SummaryRow label={b.reviewDate} value={formatLocalDateLong(draft.date)} onEdit={() => update({ step: 0 })} />
                  <SummaryRow
                    label={b.reviewTime}
                    value={draft.time && startMs ? b.reviewTimeValue(draft.time, formatParisOffset(startMs)) : t.common.none}
                    onEdit={() => update({ step: 1 })}
                  />
                  <SummaryRow label={b.reviewPeople} value={t.common.people(partySize)} onEdit={() => update({ step: 0 })} />
                  <SummaryRow
                    label={b.reviewDuration}
                    value={
                      startMs
                        ? b.reviewDurationValue(formatDuration(rules.serviceMinutes), formatTime(startMs + rules.serviceMinutes * MINUTE_MS))
                        : formatDuration(rules.serviceMinutes)
                    }
                  />
                  <SummaryRow label={b.reviewName} value={draft.customer.name.trim()} onEdit={() => update({ step: 2 })} />
                  <SummaryRow label={b.reviewEmail} value={draft.customer.email.trim()} onEdit={() => update({ step: 2 })} />
                  {draft.customer.phone.trim() && (
                    <SummaryRow label={b.reviewPhone} value={draft.customer.phone.trim()} onEdit={() => update({ step: 2 })} />
                  )}
                  {draft.customer.notes.trim() && (
                    <SummaryRow label={b.reviewNotes} value={draft.customer.notes.trim()} onEdit={() => update({ step: 2 })} />
                  )}
                </dl>
                <ul className="pub-policies">
                  <li>{b.tolerance(rules.arrivalToleranceMinutes)}</li>
                  <li>{b.cancelPolicy(rules.customerCancelMinutes)}</li>
                </ul>
                {!selectedSlot && !submitting && (
                  <Notice tone="warning">
                    <p>{b.slotGone}</p>
                    <button type="button" className="btn btn--sm" onClick={() => update({ step: 1, time: null })}>
                      {b.edit}
                    </button>
                  </Notice>
                )}
                {submitErrors.length > 0 && (
                  <div className="stack" style={{ '--stack-gap': '0.5rem' } as React.CSSProperties}>
                    <p className="notice__title">{b.reviewErrors}</p>
                    <InlineErrors errors={submitErrors} showConflicts={false} />
                  </div>
                )}
                <div className="booking-actions">
                  <button type="button" className="btn" onClick={() => update({ step: 2 })} disabled={submitting}>
                    {b.back}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    onClick={confirm}
                    disabled={submitting || !selectedSlot}
                    aria-busy={submitting}
                  >
                    {submitting && <span className="spinner" aria-hidden="true" />}
                    {submitting ? b.confirming : b.confirm}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="booking-summary" aria-label={b.summaryLabel}>
          <h2 className="booking-summary__title">{b.summaryTitle}</h2>
          <dl className="summary-list">
            <SummaryRow
              label={b.reviewPeople}
              value={draft.largeGroup ? b.partyLarger(rules.onlineMaxPartySize) : t.common.people(partySize)}
            />
            <SummaryRow label={b.reviewDate} value={draft.date ? formatLocalDateLong(draft.date) : t.common.none} />
            <SummaryRow label={b.reviewTime} value={draft.time ?? t.common.none} />
            <SummaryRow label={b.reviewDuration} value={formatDuration(rules.serviceMinutes)} />
          </dl>
          <p className="field__hint">{t.demo.timezoneNote(formatParisOffset(startMs ?? now))}</p>
        </aside>
      </div>
    </div>
  );
}
