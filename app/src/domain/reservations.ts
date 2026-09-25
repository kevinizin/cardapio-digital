import { candidateTables, maxActiveCapacity, pickTable, type Channel } from './availability';
import { normalizeCustomer, validateCustomer } from './customer';
import { LIMITS } from './defaults';
import { err, fail, ok, type DomainError, type Result } from './errors';
import { cryptoRandom, generateId, generateReservationCode, type RandomSource } from './ids';
import { buildOccupancyIndex, findConflicts, projectedServiceEnd } from './occupancy';
import { findShiftForInterval, getDayStatus, isOnGrid } from './schedule';
import { isValidLocalDate, isValidLocalTime, localToMs, MINUTE_MS, parisDate, parisTime, toIso, toMs } from './time';
import { RESERVATION_SOURCES } from './types';
import type {
  Customer,
  DemoData,
  FieldChange,
  Interval,
  LocalDate,
  LocalTime,
  Reservation,
  ReservationSource,
} from './types';

export interface ReservationDraft {
  date: LocalDate;
  time: LocalTime;
  partySize: number;
  /** 'auto' atribui a menor mesa livre que comporte o grupo. */
  tableId: string;
  serviceMinutes: number;
  prepMinutes: number;
  customer: Customer;
  source: ReservationSource;
}

export interface ValidatedDraft {
  startMs: number;
  endMs: number;
  tableId: string;
  customer: Customer;
}

export const AUTO_TABLE = 'auto';

const inRange = (value: number, range: { min: number; max: number; step: number }) =>
  Number.isInteger(value) && value >= range.min && value <= range.max && value % range.step === 0;

export function draftFromReservation(reservation: Reservation): ReservationDraft {
  const start = toMs(reservation.startAt);
  return {
    date: parisDate(start),
    time: parisTime(start),
    partySize: reservation.partySize,
    tableId: reservation.tableId,
    serviceMinutes: reservation.serviceMinutes,
    prepMinutes: reservation.prepMinutes,
    customer: { ...reservation.customer },
    source: reservation.source,
  };
}

/** Rascunho do fluxo público: sempre com mesa automática e as durações vigentes. */
export function buildOnlineDraft(
  data: DemoData,
  input: { date: LocalDate; time: LocalTime; partySize: number; customer: Customer },
): ReservationDraft {
  return {
    ...input,
    tableId: AUTO_TABLE,
    serviceMinutes: data.settings.rules.serviceMinutes,
    prepMinutes: data.settings.rules.prepMinutes,
    source: 'online',
  };
}

/**
 * Valida criação ou edição com os dados mais recentes. Na edição, a própria
 * reserva é excluída da busca de conflitos e regras de horário só são
 * reaplicadas quando dia, horário ou durações mudam.
 */
export function validateDraft(
  data: DemoData,
  draft: ReservationDraft,
  nowMs: number,
  context: { channel: Channel; original?: Reservation },
): Result<ValidatedDraft> {
  const { rules } = data.settings;
  const { original } = context;
  const online = context.channel === 'online';
  const errors: DomainError[] = [];

  if (!isValidLocalDate(draft.date)) errors.push(err('DATE_INVALID', { field: 'date' }));
  if (!isValidLocalTime(draft.time)) errors.push(err('TIME_INVALID', { field: 'time' }));
  if (errors.length) return fail(...errors);
  const startMs = localToMs(draft.date, draft.time);
  if (startMs === null) return fail(err('TIME_NONEXISTENT', { field: 'time' }));

  const serviceOk = inRange(draft.serviceMinutes, LIMITS.serviceMinutes);
  const prepOk = inRange(draft.prepMinutes, LIMITS.prepMinutes);
  if (!serviceOk) {
    errors.push(err('SERVICE_DURATION_INVALID', { field: 'serviceMinutes', params: { ...LIMITS.serviceMinutes } }));
  }
  if (!prepOk) errors.push(err('PREP_DURATION_INVALID', { field: 'prepMinutes', params: { ...LIMITS.prepMinutes } }));

  const endMs = startMs + (draft.serviceMinutes + draft.prepMinutes) * MINUTE_MS;
  const timingChanged =
    !original ||
    startMs !== toMs(original.startAt) ||
    draft.serviceMinutes !== original.serviceMinutes ||
    draft.prepMinutes !== original.prepMinutes;

  if (original?.status === 'seated' && timingChanged) {
    return fail(err('NOT_EDITABLE', { field: 'time', params: { status: original.status } }));
  }

  if (timingChanged && serviceOk && prepOk) {
    const dayStatus = getDayStatus(data.settings, draft.date, nowMs);
    if (startMs < nowMs || dayStatus === 'past') {
      errors.push(err('START_IN_PAST', { field: 'time' }));
    } else if (dayStatus === 'beyond_window') {
      errors.push(err('BEYOND_WINDOW', { field: 'date', params: { days: rules.bookingWindowDays } }));
    } else if (dayStatus === 'closed') {
      errors.push(err('DAY_CLOSED', { field: 'date' }));
    } else {
      if (online && startMs < nowMs + rules.minAdvanceMinutes * MINUTE_MS) {
        errors.push(err('MIN_ADVANCE', { field: 'time', params: { minutes: rules.minAdvanceMinutes } }));
      }
      if (online && !isOnGrid(startMs, rules.slotIntervalMinutes)) {
        errors.push(err('OFF_GRID', { field: 'time', params: { minutes: rules.slotIntervalMinutes } }));
      }
      if (!findShiftForInterval(data.settings, startMs, endMs)) {
        errors.push(err('OUTSIDE_SHIFT', { field: 'time' }));
      }
    }
  }

  if (!Number.isInteger(draft.partySize) || draft.partySize < 1) {
    errors.push(err('PARTY_SIZE_INVALID', { field: 'partySize' }));
  } else if (online && draft.partySize > rules.onlineMaxPartySize) {
    errors.push(err('PARTY_ABOVE_ONLINE_LIMIT', { field: 'partySize', params: { max: rules.onlineMaxPartySize } }));
  } else if (draft.partySize > maxActiveCapacity(data.tables)) {
    errors.push(err('PARTY_ABOVE_CAPACITY', { field: 'partySize', params: { max: maxActiveCapacity(data.tables) } }));
  }

  if (!RESERVATION_SOURCES.includes(draft.source) || (online && draft.source !== 'online')) {
    errors.push(err('SOURCE_INVALID', { field: 'source' }));
  }
  errors.push(...validateCustomer(draft.customer, { emailRequired: online || draft.source === 'online' }));
  if (errors.length) return fail(...errors);

  // Quem já está à mesa ocupa desde agora até o término projetado + preparação.
  const interval: Interval =
    original?.status === 'seated'
      ? { start: nowMs, end: projectedServiceEnd(original, nowMs) + draft.prepMinutes * MINUTE_MS }
      : { start: startMs, end: endMs };
  const tableChanged = !original || draft.tableId !== original.tableId;
  const index = buildOccupancyIndex(data, nowMs, { excludeReservationId: original?.id, relevantFrom: interval.start });

  if (draft.tableId === AUTO_TABLE) {
    const table = pickTable(candidateTables(data.tables, draft.partySize), interval, index);
    if (!table) return fail(err(online ? 'SLOT_UNAVAILABLE' : 'NO_TABLE_AVAILABLE', { field: 'tableId' }));
    return ok({ startMs, endMs, tableId: table.id, customer: normalizeCustomer(draft.customer) });
  }

  const table = data.tables.find((t) => t.id === draft.tableId);
  if (!table) return fail(err('TABLE_NOT_FOUND', { field: 'tableId' }));
  if (tableChanged && !table.active) return fail(err('TABLE_INACTIVE', { field: 'tableId', params: { table: table.id } }));
  if (table.capacity < draft.partySize) {
    return fail(
      err('TABLE_TOO_SMALL', { field: 'tableId', params: { table: table.id, capacity: table.capacity, partySize: draft.partySize } }),
    );
  }
  if (tableChanged || timingChanged) {
    const conflicts = findConflicts(index.get(table.id) ?? [], interval);
    if (conflicts.length) return fail(err('CONFLICT', { field: 'tableId', conflicts, params: { table: table.id } }));
  }
  return ok({ startMs, endMs, tableId: table.id, customer: normalizeCustomer(draft.customer) });
}

export function replaceReservation(data: DemoData, updated: Reservation): DemoData {
  return { ...data, reservations: data.reservations.map((r) => (r.id === updated.id ? updated : r)) };
}

export function createReservation(
  data: DemoData,
  draft: ReservationDraft,
  nowMs: number,
  context: { channel: Channel; random?: RandomSource },
): Result<{ data: DemoData; reservation: Reservation }> {
  const validated = validateDraft(data, draft, nowMs, { channel: context.channel });
  if (!validated.ok) return validated;
  const random = context.random ?? cryptoRandom;
  const createdAt = toIso(nowMs);
  const reservation: Reservation = {
    id: generateId('res', random),
    code: generateReservationCode(new Set(data.reservations.map((r) => r.code)), random),
    tableId: validated.value.tableId,
    partySize: draft.partySize,
    startAt: toIso(validated.value.startMs),
    serviceMinutes: draft.serviceMinutes,
    prepMinutes: draft.prepMinutes,
    customer: validated.value.customer,
    source: draft.source,
    status: 'confirmed',
    createdAt,
    updatedAt: createdAt,
    seatedAt: null,
    completedAt: null,
    prepEndedAt: null,
    prepExtensionMinutes: 0,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    noShowAt: null,
    history: [{ at: createdAt, kind: 'created', actor: context.channel === 'online' ? 'customer' : 'admin' }],
  };
  return ok({ data: { ...data, reservations: [...data.reservations, reservation] }, reservation });
}

function diffReservation(original: Reservation, draft: ReservationDraft, tableId: string, customer: Customer): FieldChange[] {
  const before = draftFromReservation(original);
  const changes: FieldChange[] = [];
  const push = (field: FieldChange['field'], from: string | number, to: string | number) => {
    if (String(from) !== String(to)) changes.push({ field, from: String(from), to: String(to) });
  };
  push('date', before.date, draft.date);
  push('time', before.time, draft.time);
  push('partySize', before.partySize, draft.partySize);
  push('tableId', before.tableId, tableId);
  push('serviceMinutes', before.serviceMinutes, draft.serviceMinutes);
  push('prepMinutes', before.prepMinutes, draft.prepMinutes);
  push('name', before.customer.name, customer.name);
  push('email', before.customer.email, customer.email);
  push('phone', before.customer.phone, customer.phone);
  push('notes', before.customer.notes, customer.notes);
  push('source', before.source, draft.source);
  return changes;
}

/** Edição administrativa com revalidação completa e registro no histórico. */
export function updateReservation(
  data: DemoData,
  reservationId: string,
  draft: ReservationDraft,
  nowMs: number,
): Result<{ data: DemoData; reservation: Reservation; changes: FieldChange[] }> {
  const original = data.reservations.find((r) => r.id === reservationId);
  if (!original) return fail(err('NOT_FOUND'));
  if (original.status !== 'confirmed' && original.status !== 'seated') {
    return fail(err('NOT_EDITABLE', { params: { status: original.status } }));
  }
  const validated = validateDraft(data, draft, nowMs, { channel: 'admin', original });
  if (!validated.ok) return validated;
  const { tableId, customer, startMs } = validated.value;
  const changes = diffReservation(original, draft, tableId, customer);
  if (changes.length === 0) return ok({ data, reservation: original, changes });

  const at = toIso(nowMs);
  const onlyTable = changes.every((c) => c.field === 'tableId');
  const updated: Reservation = {
    ...original,
    tableId,
    partySize: draft.partySize,
    startAt: toIso(startMs),
    serviceMinutes: draft.serviceMinutes,
    prepMinutes: draft.prepMinutes,
    customer,
    source: draft.source,
    updatedAt: at,
    history: [...original.history, { at, kind: onlyTable ? 'table_changed' : 'updated', actor: 'admin', changes }],
  };
  return ok({ data: replaceReservation(data, updated), reservation: updated, changes });
}

export function changeTable(
  data: DemoData,
  reservationId: string,
  tableId: string,
  nowMs: number,
): Result<{ data: DemoData; reservation: Reservation; changes: FieldChange[] }> {
  const original = data.reservations.find((r) => r.id === reservationId);
  if (!original) return fail(err('NOT_FOUND'));
  return updateReservation(data, reservationId, { ...draftFromReservation(original), tableId }, nowMs);
}
