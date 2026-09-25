import { buildOccupancyIndex, isSharedTable, tableConflicts, type OccupancySegment } from './occupancy';
import { getDayStatus, getShiftsForDate, lastBookableDate, slotStartsForShift, type DayStatus, type ResolvedShift } from './schedule';
import { addDays, MINUTE_MS, parisDate, parisTime } from './time';
import type { DemoData, Interval, LocalDate, LocalTime, ShiftKind, Table } from './types';

export type Channel = 'online' | 'admin';
export type OccupancyIndex = Map<string, OccupancySegment[]>;

export type PartyStatus = 'ok' | 'invalid' | 'above_online_limit' | 'above_capacity';

export interface SlotOption {
  startMs: number;
  time: LocalTime;
  shiftKind: ShiftKind;
  /** Mesa atribuída automaticamente (uso interno; nunca exibida ao cliente). */
  tableId: string;
}

export interface ShiftAvailability {
  shift: ResolvedShift;
  slots: SlotOption[];
}

export interface DayAvailability {
  date: LocalDate;
  status: DayStatus;
  partyStatus: PartyStatus;
  shifts: ShiftAvailability[];
  totalSlots: number;
}

const byCapacityThenId = (a: Table, b: Table) =>
  a.capacity - b.capacity || a.id.localeCompare(b.id, 'en', { numeric: true });

/**
 * Mesas ativas que comportam o grupo: primeiro as mesas comuns, da menor para
 * a maior (desempate pela identificação); depois as áreas compartilhadas, na
 * ordem cadastrada (ex.: salão antes do terraço).
 */
export function candidateTables(tables: readonly Table[], partySize: number): Table[] {
  const fits = tables.filter((t) => t.active && t.capacity >= partySize);
  return [...fits.filter((t) => !isSharedTable(t)).sort(byCapacityThenId), ...fits.filter(isSharedTable)];
}

export function maxActiveCapacity(tables: readonly Table[]): number {
  return tables.reduce((max, t) => (t.active ? Math.max(max, t.capacity) : max), 0);
}

/**
 * Mesa comum: livre se nada se sobrepõe ao intervalo. Mesa compartilhada:
 * livre se, em todo o intervalo, as pessoas já previstas + o grupo cabem.
 */
export function isTableFree(
  index: OccupancyIndex,
  table: Pick<Table, 'id' | 'capacity' | 'shared'>,
  interval: Interval,
  partySize: number,
): boolean {
  return tableConflicts(table, index.get(table.id) ?? [], interval, partySize).length === 0;
}

/** Primeira mesa candidata livre para o grupo no intervalo, de forma determinística. */
export function pickTable(
  candidates: readonly Table[],
  interval: Interval,
  index: OccupancyIndex,
  partySize: number,
): Table | null {
  return candidates.find((table) => isTableFree(index, table, interval, partySize)) ?? null;
}

export function partyStatusFor(data: Pick<DemoData, 'tables' | 'settings'>, partySize: number, channel: Channel): PartyStatus {
  if (!Number.isInteger(partySize) || partySize < 1) return 'invalid';
  if (channel === 'online' && partySize > data.settings.rules.onlineMaxPartySize) return 'above_online_limit';
  if (partySize > maxActiveCapacity(data.tables)) return 'above_capacity';
  return 'ok';
}

export interface AvailabilityOptions {
  index?: OccupancyIndex;
  excludeReservationId?: string;
}

/** Horários realmente viáveis numa data, agrupados por turno. */
export function getDayAvailability(
  data: DemoData,
  date: LocalDate,
  partySize: number,
  nowMs: number,
  channel: Channel = 'online',
  options: AvailabilityOptions = {},
): DayAvailability {
  const status = getDayStatus(data.settings, date, nowMs);
  const partyStatus = partyStatusFor(data, partySize, channel);
  if (status !== 'open' || partyStatus !== 'ok') {
    return { date, status, partyStatus, shifts: [], totalSlots: 0 };
  }
  const { rules } = data.settings;
  const blockMinutes = rules.serviceMinutes + rules.prepMinutes;
  const earliest = nowMs + (channel === 'online' ? rules.minAdvanceMinutes * MINUTE_MS : 0);
  const index =
    options.index ??
    buildOccupancyIndex(data, nowMs, { relevantFrom: nowMs, excludeReservationId: options.excludeReservationId });
  const candidates = candidateTables(data.tables, partySize);

  let totalSlots = 0;
  const shifts = getShiftsForDate(data.settings, date).map((shift) => {
    const slots: SlotOption[] = [];
    for (const startMs of slotStartsForShift(shift, rules.slotIntervalMinutes, blockMinutes)) {
      if (startMs < earliest) continue;
      const table = pickTable(candidates, { start: startMs, end: startMs + blockMinutes * MINUTE_MS }, index, partySize);
      if (table) slots.push({ startMs, time: parisTime(startMs), shiftKind: shift.kind, tableId: table.id });
    }
    totalSlots += slots.length;
    return { shift, slots };
  });
  return { date, status, partyStatus, shifts, totalSlots };
}

export interface SuggestedDate {
  date: LocalDate;
  firstSlot: SlotOption;
  totalSlots: number;
}

/** Próximas datas (depois de `afterDate`) com pelo menos um horário viável. */
export function findNextAvailableDates(
  data: DemoData,
  afterDate: LocalDate,
  partySize: number,
  nowMs: number,
  limit = 3,
  channel: Channel = 'online',
): SuggestedDate[] {
  const today = parisDate(nowMs);
  const last = lastBookableDate(data.settings, nowMs);
  const index = buildOccupancyIndex(data, nowMs, { relevantFrom: nowMs });
  const results: SuggestedDate[] = [];
  let date = afterDate < today ? today : addDays(afterDate, 1);
  while (date <= last && results.length < limit) {
    const day = getDayAvailability(data, date, partySize, nowMs, channel, { index });
    const firstSlot = day.shifts.flatMap((s) => s.slots)[0];
    if (firstSlot) results.push({ date, firstSlot, totalSlots: day.totalSlots });
    date = addDays(date, 1);
  }
  return results;
}

/** Resumo por dia (para o calendário público). */
export function summarizeDates(
  data: DemoData,
  dates: readonly LocalDate[],
  partySize: number,
  nowMs: number,
): Map<LocalDate, { status: DayStatus; totalSlots: number }> {
  const index = buildOccupancyIndex(data, nowMs, { relevantFrom: nowMs });
  const summary = new Map<LocalDate, { status: DayStatus; totalSlots: number }>();
  for (const date of dates) {
    const day = getDayAvailability(data, date, partySize, nowMs, 'online', { index });
    summary.set(date, { status: day.status, totalSlots: day.totalSlots });
  }
  return summary;
}
