/**
 * Fechamentos por período ("Fechar dias"): a dona marca de uma data até outra
 * e o sistema deixa de aceitar reservas nesses dias, avisa os clientes no site
 * e informa quando o restaurante reabre.
 *
 * Cada dia do período vira uma exceção fechada (inclusive os dias que a grade
 * semanal já fecha, como as segundas): assim o período fica contínuo na lista,
 * carrega a mesma mensagem aos clientes e continua fechado mesmo que a grade
 * semanal mude depois.
 */
import { LIMITS } from './defaults';
import { err, fail, ok, type DomainError, type Result } from './errors';
import { cryptoRandom, generateId, type RandomSource } from './ids';
import { cancelByAdmin, validateReason } from './lifecycle';
import { findException, getShiftsForDate, weeklyRulesForDate, type ResolvedShift } from './schedule';
import { findScheduleConflicts, removeException, validateException } from './settingsRules';
import { addDays, dayBounds, diffInDays, isValidLocalDate, parisDate, toMs, weekdayIndex } from './time';
import type { DateException, DemoData, LocalDate, PublicMessage, Reservation, Settings } from './types';

/** Maior período que pode ser fechado de uma vez. */
export const CLOSURE_MAX_DAYS = 60;
/** Um fechamento aparece no aviso do site quando começa dentro destes dias. */
export const CLOSURE_NOTICE_DAYS = 14;
export const CLOSURE_MESSAGE_MAX_LENGTH = 200;
/** Justificativa usada ao cancelar reservas quando a observação é curta demais. */
export const DEFAULT_CLOSURE_REASON = 'Restaurante fechado nesta data';

export type NoticeLocale = 'fr' | 'pt' | 'en';
const MESSAGE_LOCALES: readonly NoticeLocale[] = ['fr', 'pt', 'en'];

/** Busca limite ao procurar a próxima abertura (dias). */
const OPENING_SEARCH_DAYS = 120;

export interface CloseRangeInput {
  from: LocalDate;
  to: LocalDate;
  /** Observação interna (motivo), ex.: "Férias". */
  note: string;
  publicMessage?: PublicMessage;
  /**
   * Reservas confirmadas afetadas que a administração decidiu cancelar junto
   * com o fechamento (mesma operação). Sem isso, reservas afetadas impedem o
   * fechamento e voltam em `SCHEDULE_CONFLICTS`.
   */
  cancelReservationIds?: readonly string[];
}

export interface CloseRangeOutcome {
  data: DemoData;
  dates: LocalDate[];
  cancelledIds: string[];
}

/** Quantidade de dias de `from` a `to`, inclusive. */
export function diffDaysInclusive(from: LocalDate, to: LocalDate): number {
  return diffInDays(from, to) + 1;
}

export function datesInRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const count = diffInDays(from, to) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDays(from, index));
}

/** Mensagem aos clientes sem espaços sobrando; ausente se todos os idiomas estiverem vazios. */
export function cleanPublicMessage(message: PublicMessage | undefined): PublicMessage | undefined {
  if (!message) return undefined;
  const cleaned: PublicMessage = {};
  for (const locale of MESSAGE_LOCALES) {
    const text = message[locale]?.trim();
    if (text) cleaned[locale] = text;
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

/** Texto da mensagem no idioma pedido; nunca cai para outro idioma nem para a observação interna. */
export function publicMessageText(message: PublicMessage | undefined, locale: NoticeLocale): string | null {
  return message?.[locale]?.trim() || null;
}

function validateRange(input: CloseRangeInput, nowMs: number): DomainError[] {
  const errors: DomainError[] = [];
  if (!isValidLocalDate(input.from)) errors.push(err('EXCEPTION_DATE_INVALID', { field: 'from' }));
  if (!isValidLocalDate(input.to)) errors.push(err('EXCEPTION_DATE_INVALID', { field: 'to' }));
  if (!errors.length) {
    if (input.from < parisDate(nowMs)) errors.push(err('EXCEPTION_DATE_PAST', { field: 'from' }));
    if (input.to < input.from) errors.push(err('CLOSURE_RANGE_INVALID', { field: 'to' }));
    else if (diffInDays(input.from, input.to) + 1 > CLOSURE_MAX_DAYS) {
      errors.push(err('CLOSURE_TOO_LONG', { field: 'to', params: { max: CLOSURE_MAX_DAYS } }));
    }
  }
  if (input.note.trim().length > LIMITS.exceptionNoteMaxLength) {
    errors.push(err('EXCEPTION_NOTE_TOO_LONG', { field: 'note', params: { max: LIMITS.exceptionNoteMaxLength } }));
  }
  for (const locale of MESSAGE_LOCALES) {
    if ((input.publicMessage?.[locale]?.trim().length ?? 0) > CLOSURE_MESSAGE_MAX_LENGTH) {
      errors.push(err('CLOSURE_MESSAGE_TOO_LONG', { field: `publicMessage.${locale}`, params: { max: CLOSURE_MESSAGE_MAX_LENGTH } }));
    }
  }
  return errors;
}

/**
 * Fecha todos os dias de `from` a `to` (inclusive) numa única operação.
 * Exceções já existentes nessas datas (horário especial ou outro fechamento)
 * são substituídas. Clientes presentes (sentados) impedem fechar o dia.
 * Reservas confirmadas afetadas: recusa com `SCHEDULE_CONFLICTS` (e os ids),
 * a não ser que estejam em `cancelReservationIds` — então são canceladas
 * pela administração, com a observação como justificativa, na mesma operação.
 */
export function closeDateRange(
  data: DemoData,
  input: CloseRangeInput,
  nowMs: number,
  random: RandomSource = cryptoRandom,
): Result<CloseRangeOutcome> {
  const errors = validateRange(input, nowMs);
  if (errors.length) return fail(...errors);

  const dates = datesInRange(input.from, input.to);
  const dateSet = new Set(dates);
  const today = parisDate(nowMs);

  // Clientes à mesa: não dá para fechar o dia com gente sendo atendida.
  const seated = data.reservations.filter(
    (r) => r.status === 'seated' && (dateSet.has(parisDate(toMs(r.startAt))) || dateSet.has(today)),
  );
  if (seated.length) return fail(err('CLOSURE_GUESTS_PRESENT', { reservationIds: seated.map((r) => r.id) }));

  const note = input.note.trim();
  const publicMessage = cleanPublicMessage(input.publicMessage);
  const kept = data.settings.exceptions.filter((e) => !dateSet.has(e.date));
  const baseSettings: Settings = { ...data.settings, exceptions: kept };
  const created: DateException[] = [];
  for (const date of dates) {
    const weekly = weeklyRulesForDate(data.settings, date)[weekdayIndex(date)];
    const exception: DateException = {
      id: generateId('exc', random),
      date,
      closed: true,
      lunch: { ...weekly.lunch },
      dinner: { ...weekly.dinner },
      note,
      ...(publicMessage ? { publicMessage } : {}),
    };
    const problems = validateException(exception, baseSettings, nowMs);
    if (problems.length) return fail(...problems);
    created.push(exception);
  }
  const nextSettings: Settings = {
    ...data.settings,
    exceptions: [...kept, ...created].sort((a, b) => a.date.localeCompare(b.date)),
  };

  const conflicts = findScheduleConflicts(data, nextSettings, nowMs);
  const toCancel = new Set(input.cancelReservationIds ?? []);
  const remaining = conflicts.filter((r) => !toCancel.has(r.id));
  if (remaining.length) return fail(err('SCHEDULE_CONFLICTS', { reservationIds: remaining.map((r) => r.id) }));

  const reason = validateReason(note) ? DEFAULT_CLOSURE_REASON : note;
  let working = data;
  const cancelledIds: string[] = [];
  for (const reservation of conflicts) {
    const result = cancelByAdmin(working, reservation.id, reason, nowMs);
    if (!result.ok) return fail(...result.errors);
    working = result.value.data;
    cancelledIds.push(reservation.id);
  }
  return ok({ data: { ...working, settings: nextSettings }, dates, cancelledIds });
}

/** Reabre um período: remove as exceções indicadas (as datas passadas ficam no histórico). */
export function reopenClosure(data: DemoData, exceptionIds: readonly string[], nowMs: number): Result<{ data: DemoData; dates: LocalDate[] }> {
  const today = parisDate(nowMs);
  const targets = data.settings.exceptions.filter((e) => exceptionIds.includes(e.id) && e.date >= today);
  if (!targets.length) return fail(err('NOT_FOUND'));
  let working = data;
  for (const exception of targets) {
    const result = removeException(working, exception.id, nowMs);
    if (!result.ok) return result;
    working = result.value.data;
  }
  return ok({ data: working, dates: targets.map((e) => e.date) });
}

/** Dia sem nenhum turno aberto (por exceção ou pela grade semanal). */
export function isClosedDay(settings: Settings, date: LocalDate): boolean {
  return getShiftsForDate(settings, date).length === 0;
}

/** Dia fechado por uma exceção (fechamento marcado pela administração). */
function isClosedByException(settings: Settings, date: LocalDate): boolean {
  return Boolean(findException(settings, date)) && isClosedDay(settings, date);
}

function allClosedBetween(settings: Settings, after: LocalDate, before: LocalDate): boolean {
  for (let date = addDays(after, 1); date < before; date = addDays(date, 1)) {
    if (!isClosedDay(settings, date)) return false;
  }
  return true;
}

export interface ClosureRange {
  from: LocalDate;
  to: LocalDate;
  /** Exceções do período (os dias fechados só pela grade semanal não têm exceção). */
  exceptionIds: string[];
  dates: LocalDate[];
  note: string;
  publicMessage?: PublicMessage;
}

const messageKey = (message?: PublicMessage) => JSON.stringify(cleanPublicMessage(message) ?? {});

/**
 * Fechamentos da administração agrupados em períodos ("10/08 a 24/08 · Férias"):
 * exceções fechadas consecutivas com a mesma observação e mensagem, unindo
 * também quando entre elas só há dias fechados pela grade semanal.
 */
export function groupClosures(settings: Settings, fromDate: LocalDate): ClosureRange[] {
  const closed = settings.exceptions
    .filter((e) => e.closed && e.date >= fromDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const ranges: ClosureRange[] = [];
  for (const exception of closed) {
    const last = ranges[ranges.length - 1];
    if (
      last &&
      last.note === exception.note &&
      messageKey(last.publicMessage) === messageKey(exception.publicMessage) &&
      allClosedBetween(settings, last.to, exception.date)
    ) {
      last.to = exception.date;
      last.exceptionIds.push(exception.id);
      last.dates.push(exception.date);
    } else {
      ranges.push({
        from: exception.date,
        to: exception.date,
        exceptionIds: [exception.id],
        dates: [exception.date],
        note: exception.note,
        ...(cleanPublicMessage(exception.publicMessage) ? { publicMessage: cleanPublicMessage(exception.publicMessage) } : {}),
      });
    }
  }
  return ranges;
}

export interface PublicClosure {
  from: LocalDate;
  to: LocalDate;
  publicMessage?: PublicMessage;
}

/**
 * Períodos fechados vistos pelo cliente, a partir de `fromDate`: partem dos
 * fechamentos por exceção e incorporam os dias vizinhos fechados pela grade
 * semanal (ex.: exceções sáb–dom + segunda fechada + exceção terça = um só
 * período de sábado a terça) e os seguintes (a reabertura é o dia depois).
 * Nunca começam antes de `fromDate`.
 */
export function publicClosureRanges(settings: Settings, fromDate: LocalDate, untilDate: LocalDate = addDays(fromDate, 400)): PublicClosure[] {
  const dates = [...new Set(settings.exceptions.map((e) => e.date))]
    .filter((date) => date >= fromDate && date <= untilDate && isClosedByException(settings, date))
    .sort();
  const ranges: PublicClosure[] = [];
  for (const date of dates) {
    const last = ranges[ranges.length - 1];
    if (last && (date <= last.to || allClosedBetween(settings, last.to, date))) {
      if (date > last.to) last.to = date;
    } else {
      ranges.push({ from: date, to: date });
    }
  }
  for (const range of ranges) {
    let guard = 0;
    // Para trás, só quando a sequência fechada chega até `fromDate` (ex.: hoje é
    // segunda e as férias começam na terça): "fechado de ter. 06/10…" soa melhor
    // que "de seg. 05/10…" quando a segunda é fechada de todo modo.
    let start = range.from;
    while (start > fromDate && isClosedDay(settings, addDays(start, -1)) && guard++ < CLOSURE_MAX_DAYS * 2) start = addDays(start, -1);
    if (start === fromDate) range.from = start;
    guard = 0;
    while (isClosedDay(settings, addDays(range.to, 1)) && guard++ < CLOSURE_MAX_DAYS * 2) range.to = addDays(range.to, 1);
    const message = datesInRange(range.from, range.to)
      .map((date) => cleanPublicMessage(findException(settings, date)?.publicMessage))
      .find(Boolean);
    if (message) range.publicMessage = message;
  }
  // A extensão pode ter encostado dois períodos: une-os.
  return ranges.reduce<PublicClosure[]>((merged, range) => {
    const last = merged[merged.length - 1];
    if (last && range.from <= addDays(last.to, 1)) {
      if (range.to > last.to) last.to = range.to;
      if (!last.publicMessage && range.publicMessage) last.publicMessage = range.publicMessage;
    } else merged.push({ ...range });
    return merged;
  }, []);
}

/** Primeiro turno que começa a partir de `fromMs` (a reabertura). */
export function nextOpening(settings: Settings, fromMs: number, searchDays = OPENING_SEARCH_DAYS): ResolvedShift | null {
  const start = parisDate(fromMs);
  for (let offset = 0; offset <= searchDays; offset += 1) {
    const shift = getShiftsForDate(settings, addDays(start, offset)).find((s) => s.startMs >= fromMs);
    if (shift) return shift;
  }
  return null;
}

export type ClosureNotice =
  | { kind: 'closed_today'; until: LocalDate; message: string | null; reopen: ResolvedShift | null }
  | { kind: 'upcoming'; from: LocalDate; to: LocalDate; message: string | null; reopen: ResolvedShift | null };

/**
 * Avisos do topo do site, em ordem: fechado hoje (por exceção ou pela grade
 * semanal — nunca quando apenas o expediente de hoje já terminou) e o próximo
 * fechamento por exceção que começa em até `noticeDays` dias (depois do
 * período atual, se hoje estiver fechado).
 */
export function getClosureNotices(
  settings: Settings,
  nowMs: number,
  locale: NoticeLocale,
  noticeDays = CLOSURE_NOTICE_DAYS,
): ClosureNotice[] {
  const today = parisDate(nowMs);
  const notices: ClosureNotice[] = [];
  let after = today;
  if (isClosedDay(settings, today)) {
    const range = publicClosureRanges(settings, today, addDays(today, CLOSURE_MAX_DAYS)).find((r) => r.from <= today && today <= r.to);
    after = range?.to ?? today;
    notices.push({
      kind: 'closed_today',
      until: after,
      message: publicMessageText(range?.publicMessage, locale),
      reopen: nextOpening(settings, nowMs),
    });
  }
  const upcoming = publicClosureRanges(settings, addDays(today, 1), addDays(today, noticeDays)).find((r) => r.from > after);
  if (upcoming) {
    notices.push({
      kind: 'upcoming',
      from: upcoming.from,
      to: upcoming.to,
      message: publicMessageText(upcoming.publicMessage, locale),
      reopen: nextOpening(settings, dayBounds(addDays(upcoming.to, 1)).startMs),
    });
  }
  return notices;
}

/** O aviso principal (o primeiro de `getClosureNotices`). */
export function getClosureNotice(settings: Settings, nowMs: number, locale: NoticeLocale, noticeDays = CLOSURE_NOTICE_DAYS): ClosureNotice | null {
  return getClosureNotices(settings, nowMs, locale, noticeDays)[0] ?? null;
}

/** Explicação de um dia fechado no calendário de reservas: mensagem e reabertura. */
export function closedDayInfo(
  settings: Settings,
  date: LocalDate,
  locale: NoticeLocale,
): { byException: boolean; message: string | null; until: LocalDate; reopen: ResolvedShift | null } {
  const range = publicClosureRanges(settings, date, addDays(date, CLOSURE_MAX_DAYS)).find((r) => r.from <= date && date <= r.to);
  return {
    byException: isClosedByException(settings, date),
    message: publicMessageText(range?.publicMessage, locale),
    until: range?.to ?? date,
    reopen: nextOpening(settings, dayBounds(date).startMs),
  };
}

export type SpecialItem =
  | { kind: 'closed'; from: LocalDate; to: LocalDate; message: string | null }
  | { kind: 'hours'; date: LocalDate; exception: DateException };

/** Datas especiais do cartão "Horários": períodos fechados e dias com horário especial. */
export function upcomingSpecials(settings: Settings, fromDate: LocalDate, untilDate: LocalDate, locale: NoticeLocale): SpecialItem[] {
  const closed: SpecialItem[] = publicClosureRanges(settings, fromDate, untilDate).map((r) => ({
    kind: 'closed',
    from: r.from,
    to: r.to,
    message: publicMessageText(r.publicMessage, locale),
  }));
  const hours: SpecialItem[] = settings.exceptions
    .filter((e) => e.date >= fromDate && e.date <= untilDate && !isClosedDay(settings, e.date))
    .map((exception) => ({ kind: 'hours', date: exception.date, exception }));
  const key = (item: SpecialItem) => (item.kind === 'closed' ? item.from : item.date);
  return [...closed, ...hours].sort((a, b) => key(a).localeCompare(key(b)));
}

/** Reservas afetadas, para exibir antes de confirmar (ordem cronológica). */
export function sortByStart(reservations: readonly Reservation[]): Reservation[] {
  return [...reservations].sort((a, b) => toMs(a.startAt) - toMs(b.startAt));
}
