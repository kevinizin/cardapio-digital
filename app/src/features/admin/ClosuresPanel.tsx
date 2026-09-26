import { CalendarX2, Mail, Phone } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DateField } from '../../components/DateField';
import { Dialog } from '../../components/Dialog';
import { InlineErrors, useToast } from '../../components/Feedback';
import { describedBy, Field } from '../../components/Field';
import { loadHolidayYear, type HolidayYear } from '../../data/holidaysApi';
import {
  CLOSURE_MAX_DAYS,
  CLOSURE_MESSAGE_MAX_LENGTH,
  closeDateRange,
  diffDaysInclusive,
  groupClosures,
  isClosedDay,
  reopenClosure,
  sortByStart,
  type CloseRangeInput,
  type ClosureRange,
} from '../../domain/closures';
import { LIMITS } from '../../domain/defaults';
import type { DomainError } from '../../domain/errors';
import { holidaysBetween, type HolidayWithPt } from '../../domain/holidays';
import { findException } from '../../domain/schedule';
import { addDays, isValidLocalDate, parisDate, toMs } from '../../domain/time';
import type { LocalDate, PublicMessage, Reservation } from '../../domain/types';
import { errorMessage, formatLocalDateCompact, formatTime, t } from '../../i18n';
import { useData, useNow, useStore } from '../../state/store';
import './closures.css';

const c = t.admin.settings.closures;
const HOLIDAY_WINDOW_DAYS = 90;
const LANGS = [
  { key: 'fr', label: c.messageFr, placeholder: c.messagePlaceholderFr, lang: 'fr' },
  { key: 'pt', label: c.messagePt, placeholder: c.messagePlaceholderPt, lang: 'pt-BR' },
  { key: 'en', label: c.messageEn, placeholder: c.messagePlaceholderEn, lang: 'en' },
] as const;

type Draft = { from: LocalDate | ''; to: LocalDate | ''; note: string; message: Required<PublicMessage> };

const emptyDraft = (): Draft => ({ from: '', to: '', note: '', message: { fr: '', pt: '', en: '' } });

const rangeLabel = (from: LocalDate, to: LocalDate) => c.range(formatLocalDateCompact(from), formatLocalDateCompact(to));

/** Tabela das reservas afetadas: data, hora, nome, pessoas e contatos clicáveis. */
function AffectedList({ reservations }: { reservations: Reservation[] }) {
  return (
    <ul className="closure-affected">
      {reservations.map((r) => {
        const start = toMs(r.startAt);
        const phone = r.customer.phone.trim();
        const email = r.customer.email.trim();
        return (
          <li key={r.id}>
            <span className="closure-affected__when num">
              {formatLocalDateCompact(parisDate(start))} · {formatTime(start)}
            </span>
            <span className="closure-affected__who">
              <strong>{r.customer.name}</strong> · {t.common.people(r.partySize)}
            </span>
            <span className="closure-affected__contact">
              {phone && (
                <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} aria-label={`${c.affectedCall(r.customer.name)}: ${phone}`}>
                  <Phone aria-hidden="true" />
                  {phone}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} aria-label={`${c.affectedMail(r.customer.name)}: ${email}`}>
                  <Mail aria-hidden="true" />
                  {email}
                </a>
              )}
              {!phone && !email && <span className="subtle">{c.noContact}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function messageLanguages(message?: PublicMessage): string | null {
  const langs = LANGS.filter((l) => message?.[l.key]).map((l) => l.key.toUpperCase());
  return langs.length ? langs.join(' · ') : null;
}

/**
 * "Fechar dias": período (um ou vários dias), motivo interno e mensagem
 * opcional aos clientes; lista dos próximos fechamentos com "Reabrir";
 * sugestões de feriados franceses.
 */
export function ClosuresPanel() {
  const data = useData();
  const store = useStore();
  const notify = useToast();
  const now = useNow(60_000);
  const today = parisDate(now);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<DomainError[]>([]);
  /** Fechamento aguardando decisão sobre as reservas afetadas. */
  const [pending, setPending] = useState<{ input: CloseRangeInput; ids: string[]; errors: DomainError[] } | null>(null);
  const [reopening, setReopening] = useState<ClosureRange | null>(null);
  const [reopenErrors, setReopenErrors] = useState<DomainError[]>([]);

  const ranges = useMemo(() => groupClosures(data.settings, today), [data.settings, today]);
  const pastCount = data.settings.exceptions.filter((e) => e.closed && e.date < today).length;
  const affected = useMemo(
    () => sortByStart(data.reservations.filter((r) => r.status === 'confirmed' && pending?.ids.includes(r.id))),
    [data.reservations, pending],
  );
  const seatedIds = errors.find((e) => e.code === 'CLOSURE_GUESTS_PRESENT')?.reservationIds ?? [];

  const draftValid = isValidLocalDate(draft.from) && isValidLocalDate(draft.to) && draft.to >= draft.from;
  const dayCount = draftValid ? diffDaysInclusive(draft.from, draft.to) : 0;

  /** Executa o fechamento; reservas afetadas abrem o diálogo de decisão. */
  const run = (input: CloseRangeInput, cancelIds?: string[]): boolean => {
    const result = store.execute((fresh, nowMs) => closeDateRange(fresh, { ...input, cancelReservationIds: cancelIds }, nowMs));
    if (result.ok) {
      const cancelled = result.value.cancelledIds.length;
      notify({
        tone: 'success',
        title: `${c.closedToast(result.value.dates.length)}: ${rangeLabel(input.from, input.to)}`,
        description: cancelled ? c.cancelledToast(cancelled) : undefined,
      });
      setPending(null);
      setErrors([]);
      return true;
    }
    const conflict = result.errors.find((e) => e.code === 'SCHEDULE_CONFLICTS');
    if (conflict?.reservationIds?.length) {
      // Novas reservas surgiram enquanto o diálogo estava aberto: somam-se às já listadas.
      setPending({ input, ids: [...new Set([...(cancelIds ?? []), ...conflict.reservationIds])], errors: [] });
      return false;
    }
    if (pending) setPending({ ...pending, errors: result.errors });
    else setErrors(result.errors);
    return false;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input: CloseRangeInput = {
      from: draft.from,
      // Sem data final: fecha só o dia inicial.
      to: draft.to || draft.from,
      note: draft.note,
      publicMessage: draft.message,
    };
    if (run(input)) setDraft(emptyDraft());
  };

  const fieldError = (field: string) => {
    const error = errors.find((e) => e.field === field);
    return error ? errorMessage(error) : null;
  };

  return (
    <div className="closures stack">
      <form noValidate onSubmit={submit} className="settings-subform stack closures__form" aria-labelledby="closures-title">
        <div className="closures__head">
          <CalendarX2 aria-hidden="true" />
          <div>
            <h3 className="drawer-section__title" id="closures-title">
              {c.title}
            </h3>
            <p className="field__hint">{c.intro}</p>
          </div>
        </div>
        <div className="form-grid closures__dates">
          <Field id="closure-from" label={c.from} error={fieldError('from')}>
            <DateField
              id="closure-from"
              value={draft.from}
              invalid={Boolean(fieldError('from'))}
              onChange={(value) => setDraft((d) => ({ ...d, from: value, to: !d.to || (value && d.to < value) ? value : d.to }))}
            />
          </Field>
          <Field id="closure-to" label={c.to} hint={c.toHint} error={fieldError('to')}>
            <DateField
              id="closure-to"
              value={draft.to}
              invalid={Boolean(fieldError('to'))}
              describedBy={describedBy('closure-to', c.toHint, fieldError('to'))}
              onChange={(value) => setDraft((d) => ({ ...d, to: value }))}
            />
          </Field>
        </div>
        <Field id="closure-note" label={c.note} hint={c.noteHint} optional error={fieldError('note')}>
          <input
            id="closure-note"
            className="input"
            maxLength={LIMITS.exceptionNoteMaxLength}
            value={draft.note}
            aria-describedby={describedBy('closure-note', c.noteHint, fieldError('note'))}
            onChange={(event) => setDraft((d) => ({ ...d, note: event.target.value }))}
          />
        </Field>
        <fieldset className="closures__messages">
          <legend className="field__label">{c.messageTitle}</legend>
          <p className="field__hint">{c.messageHint}</p>
          <div className="closures__message-grid">
            {LANGS.map((l) => (
              <Field key={l.key} id={`closure-msg-${l.key}`} label={l.label} error={fieldError(`publicMessage.${l.key}`)}>
                <input
                  id={`closure-msg-${l.key}`}
                  className="input"
                  lang={l.lang}
                  maxLength={CLOSURE_MESSAGE_MAX_LENGTH}
                  placeholder={l.placeholder}
                  value={draft.message[l.key]}
                  onChange={(event) => setDraft((d) => ({ ...d, message: { ...d.message, [l.key]: event.target.value } }))}
                />
              </Field>
            ))}
          </div>
        </fieldset>
        {dayCount > 0 && dayCount <= CLOSURE_MAX_DAYS && (
          <p className="closures__preview" aria-live="polite">
            {c.preview(dayCount, rangeLabel(draft.from as LocalDate, draft.to as LocalDate))}
          </p>
        )}
        <InlineErrors errors={errors.filter((e) => !e.field || e.code === 'CLOSURE_GUESTS_PRESENT')} />
        {seatedIds.length > 0 && (
          <div className="stack" style={{ '--stack-gap': '0.4rem' } as React.CSSProperties}>
            <p className="field__label">{c.guestsTitle}</p>
            <AffectedList reservations={sortByStart(data.reservations.filter((r) => seatedIds.includes(r.id)))} />
          </div>
        )}
        <div className="section-actions">
          <button type="submit" className="btn btn--primary">
            <CalendarX2 aria-hidden="true" />
            {c.submit}
          </button>
        </div>
      </form>

      <div className="stack">
        <h3 className="drawer-section__title">{c.listTitle}</h3>
        {ranges.length === 0 ? (
          <p className="subtle">{c.empty}</p>
        ) : (
          <ul className="closures__list">
            {ranges.map((range) => {
              const languages = messageLanguages(range.publicMessage);
              const days = diffDaysInclusive(range.from, range.to);
              return (
                <li key={range.exceptionIds[0]}>
                  <div className="closures__range">
                    <strong className="num">{rangeLabel(range.from, range.to)}</strong>
                    <span className="subtle">
                      {' '}
                      · {c.days(days)}
                      {range.note && <> · {range.note}</>}
                    </span>
                    {range.from <= today && <span className="badge badge--cancelled closures__today">{c.today}</span>}
                    {languages && <span className="closures__lang">{c.hasMessage(languages)}</span>}
                  </div>
                  <button type="button" className="btn btn--sm" onClick={() => setReopening(range)}>
                    {c.reopen}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {pastCount > 0 && <p className="field__hint">{c.past(pastCount)}</p>}
      </div>

      <HolidaySuggestions
        today={today}
        onClose={(holiday) =>
          run({ from: holiday.date, to: holiday.date, note: c.holidayNote(holiday.ptName.replace(/ \(.*\)$/, '')) })
        }
      />

      <Dialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={c.affectedTitle}
        variant="wide"
        description={pending ? `${rangeLabel(pending.input.from, pending.input.to)} · ${c.affectedIntro(affected.length)}` : undefined}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setPending(null)}>
              {t.common.back}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                if (pending && run(pending.input, pending.ids)) setDraft(emptyDraft());
              }}
            >
              {c.affectedConfirm}
            </button>
          </>
        }
      >
        <AffectedList reservations={affected} />
        {pending && pending.errors.length > 0 && <InlineErrors errors={pending.errors} />}
      </Dialog>

      <ConfirmDialog
        open={Boolean(reopening)}
        title={c.reopenTitle}
        description={reopening ? c.reopenText(rangeLabel(reopening.from, reopening.to)) : ''}
        confirmLabel={c.reopen}
        errors={reopenErrors}
        onClose={() => {
          setReopening(null);
          setReopenErrors([]);
        }}
        onConfirm={() => {
          if (!reopening) return;
          const result = store.execute((fresh, nowMs) => reopenClosure(fresh, reopening.exceptionIds, nowMs));
          if (!result.ok) return setReopenErrors(result.errors);
          setReopening(null);
          notify({ tone: 'success', title: c.reopenedToast });
        }}
      />
    </div>
  );
}

/** Feriados franceses dos próximos 90 dias, com a situação de cada um e "Fechar este dia". */
function HolidaySuggestions({ today, onClose }: { today: LocalDate; onClose: (holiday: HolidayWithPt) => void }) {
  const store = useStore();
  const data = useData();
  const until = addDays(today, HOLIDAY_WINDOW_DAYS);
  const years = useMemo(() => [...new Set([Number(today.slice(0, 4)), Number(until.slice(0, 4))])], [today, until]);
  const [loaded, setLoaded] = useState<{ key: string; years: HolidayYear[] } | null>(null);
  const key = `${store.kind}|${years.join(',')}`;

  useEffect(() => {
    let active = true;
    Promise.all(years.map((year) => loadHolidayYear(year, store.kind))).then((result) => {
      if (active) setLoaded({ key, years: result });
    });
    return () => {
      active = false;
    };
  }, [key, years, store.kind]);

  const ready = loaded?.key === key;
  const holidays = ready ? holidaysBetween(loaded.years.flatMap((y) => y.holidays), today, until) : [];
  const offline = ready && store.kind === 'remote' && loaded.years.some((y) => y.source === 'local');

  return (
    <div className="stack closures__holidays">
      <div>
        <h3 className="drawer-section__title">{c.holidaysTitle}</h3>
        <p className="field__hint">{c.holidaysIntro}</p>
      </div>
      {!ready ? (
        <p className="subtle" aria-live="polite">
          {c.holidaysLoading}
        </p>
      ) : holidays.length === 0 ? (
        <p className="subtle">{c.holidaysEmpty}</p>
      ) : (
        <ul className="closures__list">
          {holidays.map((holiday) => {
            const closed = isClosedDay(data.settings, holiday.date);
            const special = !closed && Boolean(findException(data.settings, holiday.date));
            return (
              <li key={holiday.date}>
                <div className="closures__range">
                  <strong className="num">{formatLocalDateCompact(holiday.date)}</strong>{' '}
                  <span>{holiday.ptName}</span>
                  <span className="subtle" lang="fr">
                    {' '}
                    · {holiday.localName}
                  </span>
                  <span className={`badge ${closed ? 'badge--cancelled' : special ? 'badge--warning' : 'badge--free'} closures__today`}>
                    {closed ? c.holidayClosed : special ? c.holidayHours : c.holidayOpen}
                  </span>
                </div>
                {!closed && (
                  <button type="button" className="btn btn--sm" onClick={() => onClose(holiday)}>
                    {c.closeHoliday}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {offline && <p className="field__hint">{c.holidaysOffline}</p>}
    </div>
  );
}
