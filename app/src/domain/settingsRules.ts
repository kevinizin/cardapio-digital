import { maxActiveCapacity } from './availability';
import { LIMITS } from './defaults';
import { err, fail, ok, type DomainError, type DomainWarning, type Result } from './errors';
import { isPrepActive } from './lifecycle';
import { isSharedTable, overloadedReservationIds, plannedBlockEnd, segmentsForTable } from './occupancy';
import { currentWeeklyRules, findShiftForInterval } from './schedule';
import { isValidLocalDate, isValidLocalTime, parisDate, timeToMinutes, toIso, toMs } from './time';
import type { BookingRules, DateException, DayRule, DemoData, Reservation, Settings, Table, WeeklyRules } from './types';

type RangeKey = Exclude<keyof BookingRules, 'slotIntervalMinutes' | 'phoneRequired'>;

const RULE_RANGES: Record<RangeKey, { min: number; max: number; step: number }> = {
  serviceMinutes: LIMITS.serviceMinutes,
  prepMinutes: LIMITS.prepMinutes,
  minAdvanceMinutes: LIMITS.minAdvanceMinutes,
  bookingWindowDays: LIMITS.bookingWindowDays,
  arrivalToleranceMinutes: LIMITS.arrivalToleranceMinutes,
  customerCancelMinutes: LIMITS.customerCancelMinutes,
  onlineMaxPartySize: LIMITS.onlineMaxPartySize,
};

export function validateRules(rules: BookingRules, tables: readonly Table[]): DomainError[] {
  const errors: DomainError[] = [];
  for (const key of Object.keys(RULE_RANGES) as RangeKey[]) {
    const range = RULE_RANGES[key];
    const value = rules[key];
    if (!Number.isInteger(value) || value < range.min || value > range.max || value % range.step !== 0) {
      errors.push(err('RULE_OUT_OF_RANGE', { field: key, params: { ...range } }));
    }
  }
  if (rules.phoneRequired !== undefined && typeof rules.phoneRequired !== 'boolean') {
    errors.push(err('RULE_OUT_OF_RANGE', { field: 'phoneRequired' }));
  }
  if (!LIMITS.slotIntervalOptions.includes(rules.slotIntervalMinutes)) {
    errors.push(err('RULE_OUT_OF_RANGE', { field: 'slotIntervalMinutes', params: { options: LIMITS.slotIntervalOptions.join(', ') } }));
  }
  const capacity = maxActiveCapacity(tables);
  if (Number.isInteger(rules.onlineMaxPartySize) && rules.onlineMaxPartySize > capacity) {
    errors.push(err('ONLINE_LIMIT_ABOVE_CAPACITY', { field: 'onlineMaxPartySize', params: { max: capacity } }));
  }
  return errors;
}

/** Valida os dois turnos de um dia: horários, ordem e ausência de sobreposição. */
export function validateDayRule(rule: DayRule, fieldPrefix: string): DomainError[] {
  const errors: DomainError[] = [];
  const valid: Partial<Record<'lunch' | 'dinner', { start: number; end: number }>> = {};
  for (const kind of ['lunch', 'dinner'] as const) {
    const shift = rule[kind];
    if (!shift.enabled) continue;
    if (!isValidLocalTime(shift.start) || !isValidLocalTime(shift.end)) {
      errors.push(err('SHIFT_TIME_INVALID', { field: `${fieldPrefix}.${kind}` }));
      continue;
    }
    const start = timeToMinutes(shift.start);
    const end = timeToMinutes(shift.end);
    if (start >= end) {
      errors.push(err('SHIFT_ORDER_INVALID', { field: `${fieldPrefix}.${kind}` }));
      continue;
    }
    valid[kind] = { start, end };
  }
  if (valid.lunch && valid.dinner && (valid.lunch.start >= valid.dinner.start || valid.lunch.end > valid.dinner.start)) {
    errors.push(err('SHIFTS_OVERLAP', { field: `${fieldPrefix}.dinner` }));
  }
  return errors;
}

export function validateWeekly(weekly: WeeklyRules): DomainError[] {
  if (weekly.length !== 7) return [err('SHIFT_TIME_INVALID', { field: 'weekly' })];
  return weekly.flatMap((rule, index) => validateDayRule(rule, `weekly.${index}`));
}

/** Reservas confirmadas futuras que deixariam de caber no funcionamento. */
export function findScheduleConflicts(data: DemoData, nextSettings: Settings, nowMs: number): Reservation[] {
  return data.reservations.filter(
    (r) =>
      r.status === 'confirmed' &&
      plannedBlockEnd(r) > nowMs &&
      !findShiftForInterval(nextSettings, toMs(r.startAt), plannedBlockEnd(r)),
  );
}

function shortShiftWarnings(settings: Settings): DomainWarning[] {
  const needed = settings.rules.serviceMinutes + settings.rules.prepMinutes;
  const short = currentWeeklyRules(settings).some((day) =>
    (['lunch', 'dinner'] as const).some(
      (kind) =>
        day[kind].enabled &&
        isValidLocalTime(day[kind].start) &&
        isValidLocalTime(day[kind].end) &&
        timeToMinutes(day[kind].end) - timeToMinutes(day[kind].start) < needed,
    ),
  );
  return short ? [{ code: 'SHIFT_TOO_SHORT', params: { minutes: needed } }] : [];
}

/** Nova grade semanal vale a partir de hoje; versões anteriores preservam o histórico. */
export function saveWeeklySchedule(data: DemoData, weekly: WeeklyRules, nowMs: number): Result<{ data: DemoData }> {
  const errors = validateWeekly(weekly);
  if (errors.length) return fail(...errors);
  const today = parisDate(nowMs);
  const nextSettings: Settings = {
    ...data.settings,
    weeklyVersions: [
      ...data.settings.weeklyVersions.filter((v) => v.effectiveFrom < today),
      { effectiveFrom: today, weekly: structuredClone(weekly) },
    ],
  };
  const conflicts = findScheduleConflicts(data, nextSettings, nowMs);
  if (conflicts.length) return fail(err('SCHEDULE_CONFLICTS', { reservationIds: conflicts.map((r) => r.id) }));
  return ok({ data: { ...data, settings: nextSettings } }, shortShiftWarnings(nextSettings));
}

export function validateException(exception: DateException, settings: Settings, nowMs: number): DomainError[] {
  const errors: DomainError[] = [];
  if (!isValidLocalDate(exception.date)) {
    errors.push(err('EXCEPTION_DATE_INVALID', { field: 'date' }));
  } else if (exception.date < parisDate(nowMs)) {
    errors.push(err('EXCEPTION_DATE_PAST', { field: 'date' }));
  } else if (settings.exceptions.some((e) => e.date === exception.date && e.id !== exception.id)) {
    errors.push(err('EXCEPTION_DUPLICATE', { field: 'date' }));
  }
  if (!exception.closed) errors.push(...validateDayRule({ lunch: exception.lunch, dinner: exception.dinner }, 'exception'));
  if (exception.note.trim().length > LIMITS.exceptionNoteMaxLength) {
    errors.push(err('EXCEPTION_NOTE_TOO_LONG', { field: 'note', params: { max: LIMITS.exceptionNoteMaxLength } }));
  }
  return errors;
}

export function saveException(data: DemoData, exception: DateException, nowMs: number): Result<{ data: DemoData }> {
  const errors = validateException(exception, data.settings, nowMs);
  if (errors.length) return fail(...errors);
  const cleaned: DateException = { ...structuredClone(exception), note: exception.note.trim() };
  const exists = data.settings.exceptions.some((e) => e.id === exception.id);
  const nextSettings: Settings = {
    ...data.settings,
    exceptions: (exists
      ? data.settings.exceptions.map((e) => (e.id === exception.id ? cleaned : e))
      : [...data.settings.exceptions, cleaned]
    ).sort((a, b) => a.date.localeCompare(b.date)),
  };
  const conflicts = findScheduleConflicts(data, nextSettings, nowMs);
  if (conflicts.length) return fail(err('SCHEDULE_CONFLICTS', { reservationIds: conflicts.map((r) => r.id) }));
  return ok({ data: { ...data, settings: nextSettings } });
}

export function removeException(data: DemoData, exceptionId: string, nowMs: number): Result<{ data: DemoData }> {
  const exception = data.settings.exceptions.find((e) => e.id === exceptionId);
  if (!exception) return fail(err('NOT_FOUND'));
  if (exception.date < parisDate(nowMs)) return fail(err('EXCEPTION_DATE_PAST'));
  const nextSettings: Settings = {
    ...data.settings,
    exceptions: data.settings.exceptions.filter((e) => e.id !== exceptionId),
  };
  const conflicts = findScheduleConflicts(data, nextSettings, nowMs);
  if (conflicts.length) return fail(err('SCHEDULE_CONFLICTS', { reservationIds: conflicts.map((r) => r.id) }));
  return ok({ data: { ...data, settings: nextSettings } });
}

/** Regras valem para reservas novas; as existentes guardam duração e preparação próprias. */
export function saveRules(data: DemoData, rules: BookingRules): Result<{ data: DemoData }> {
  const errors = validateRules(rules, data.tables);
  if (errors.length) return fail(...errors);
  const nextSettings: Settings = { ...data.settings, rules: { ...rules } };
  return ok({ data: { ...data, settings: nextSettings } }, shortShiftWarnings(nextSettings));
}

/**
 * Capacidade e ativação de mesas: bloqueia o salvamento se reservas futuras,
 * clientes presentes ou preparações em andamento ficariam inválidos.
 */
export function saveTables(
  data: DemoData,
  changes: readonly { id: string; capacity: number; active: boolean }[],
  nowMs: number,
): Result<{ data: DemoData }> {
  const errors: DomainError[] = [];
  const nextTables: Table[] = data.tables.map((table) => {
    const change = changes.find((c) => c.id === table.id);
    return change ? { ...table, capacity: change.capacity, active: change.active } : table;
  });
  for (const table of nextTables) {
    const range = isSharedTable(table) ? LIMITS.sharedCapacity : LIMITS.tableCapacity;
    if (!Number.isInteger(table.capacity) || table.capacity < range.min || table.capacity > range.max) {
      errors.push(err('CAPACITY_INVALID', { field: `tables.${table.id}.capacity`, params: { min: range.min, max: range.max } }));
    }
  }
  if (!nextTables.some((t) => t.active)) errors.push(err('NO_ACTIVE_TABLES'));
  if (errors.length) return fail(...errors);

  const conflicting = data.reservations.filter((r) => {
    const table = nextTables.find((t) => t.id === r.tableId);
    if (!table) return false;
    const upcoming = r.status === 'confirmed' && plannedBlockEnd(r) > nowMs;
    const onTableNow = r.status === 'seated' || (r.status === 'completed' && isPrepActive(r, nowMs));
    if (!table.active && (upcoming || onTableNow)) return true;
    return (upcoming || r.status === 'seated') && r.partySize > table.capacity;
  });
  // Áreas compartilhadas: a nova capacidade precisa comportar o pico de pessoas simultâneas.
  for (const table of nextTables) {
    const before = data.tables.find((t) => t.id === table.id);
    if (!isSharedTable(table) || !table.active || !before || table.capacity >= before.capacity) continue;
    const segments = segmentsForTable(data, table.id, nowMs, { relevantFrom: nowMs });
    for (const id of overloadedReservationIds(segments, table.capacity, nowMs)) {
      const r = data.reservations.find((item) => item.id === id);
      if (r && !conflicting.includes(r)) conflicting.push(r);
    }
  }
  if (conflicting.length) {
    return fail(err('TABLE_CHANGE_CONFLICTS', { reservationIds: conflicting.map((r) => r.id) }));
  }
  if (data.settings.rules.onlineMaxPartySize > maxActiveCapacity(nextTables)) {
    return fail(err('ONLINE_LIMIT_ABOVE_CAPACITY', { field: 'onlineMaxPartySize', params: { max: maxActiveCapacity(nextTables) } }));
  }

  const at = toIso(nowMs);
  const events = nextTables
    .filter((table) => data.tables.find((t) => t.id === table.id)?.active !== table.active)
    .map((table) => ({ tableId: table.id, active: table.active, at }));
  return ok({ data: { ...data, tables: nextTables, tableEvents: [...data.tableEvents, ...events] } });
}
