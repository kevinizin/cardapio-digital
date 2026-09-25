import { intersectLists, mergeIntervals, subtractIntervals, totalDuration } from './intervals';
import { blockSegment, getLiveTableStatus } from './occupancy';
import { getShiftsForDate } from './schedule';
import { daysOfMonth, MINUTE_MS, monthBounds, parisDate, parisMonth, parisTime, toMs, weekdayIndex } from './time';
import type { DemoData, Interval, LocalDate, LocalTime, MonthKey, Reservation, ShiftKind, Table, TableEvent } from './types';

export interface OccupancyRatio {
  numeratorMinutes: number;
  denominatorMinutes: number;
  /** null quando o denominador é zero (exibir "indisponível"). */
  ratio: number | null;
}

export interface MonthlyMetrics {
  month: MonthKey;
  /** Criadas no mês (qualquer mês de atendimento), incluindo as canceladas depois. */
  received: { total: number; laterCancelled: number };
  /** Atendimento no mês, excluindo canceladas. */
  expected: { total: number; confirmed: number; seated: number; completed: number; noShow: number };
  /** Pessoas das reservas não canceladas e sem ausência (inclui concluídas), por mês de atendimento. */
  peopleExpected: number;
  /** Pessoas das reservas concluídas, por mês de atendimento. */
  peopleServed: number;
  cancellations: { reservations: number; people: number };
  noShows: { reservations: number; people: number };
  /** Base dos gráficos: reservas com atendimento no mês, exceto canceladas. */
  daily: { date: LocalDate; reservations: number }[];
  weekdays: { weekday: number; reservations: number }[];
  startTimes: { time: LocalTime; reservations: number }[];
  occupancy: {
    planned: OccupancyRatio;
    lunch: OccupancyRatio;
    dinner: OccupancyRatio;
    realized: OccupancyRatio;
  };
}

const ratioOf = (numeratorMs: number, denominatorMs: number): OccupancyRatio => ({
  numeratorMinutes: Math.round(numeratorMs / MINUTE_MS),
  denominatorMinutes: Math.round(denominatorMs / MINUTE_MS),
  ratio: denominatorMs > 0 ? Math.min(1, numeratorMs / denominatorMs) : null,
});

/** Períodos em que a mesa esteve ativa dentro do intervalo, a partir do registro de ativações. */
export function tableActiveIntervals(table: Table, events: readonly TableEvent[], range: Interval): Interval[] {
  const own = events.filter((e) => e.tableId === table.id).sort((a, b) => toMs(a.at) - toMs(b.at));
  const before = own.filter((e) => toMs(e.at) <= range.start);
  let active = before.length ? before[before.length - 1].active : own.length ? !own[0].active : table.active;
  let cursor = range.start;
  const intervals: Interval[] = [];
  for (const event of own) {
    const at = toMs(event.at);
    if (at <= range.start || at >= range.end) continue;
    if (active && at > cursor) intervals.push({ start: cursor, end: at });
    active = event.active;
    cursor = at;
  }
  if (active && range.end > cursor) intervals.push({ start: cursor, end: range.end });
  return intervals;
}

/**
 * Ocupação: minutos de atendimento reservados (sem canceladas/ausências; sem
 * preparação) ÷ minutos de mesas ativas e abertas. Turnos recortam tudo;
 * bloqueios e fechamentos reduzem o denominador uma única vez (união).
 */
export function computeOccupancy(
  data: DemoData,
  month: MonthKey,
  nowMs: number,
  shiftKind?: ShiftKind,
): { planned: OccupancyRatio; realized: OccupancyRatio } {
  const bounds = monthBounds(month);
  const range: Interval = { start: bounds.startMs, end: bounds.endMs };
  const shiftWindows: Interval[] = daysOfMonth(month)
    .flatMap((date) => getShiftsForDate(data.settings, date))
    .filter((shift) => !shiftKind || shift.kind === shiftKind)
    .map((shift) => ({ start: shift.startMs, end: shift.endMs }));
  const elapsed: Interval[] = [{ start: range.start, end: Math.min(range.end, nowMs) }];

  let plannedNum = 0;
  let plannedDen = 0;
  let realizedNum = 0;
  let realizedDen = 0;

  for (const table of data.tables) {
    const open = intersectLists(shiftWindows, tableActiveIntervals(table, data.tableEvents, range));
    const blocks = data.blocks.filter((b) => b.tableId === table.id).map(blockSegment);
    const available = subtractIntervals(open, blocks);
    plannedDen += totalDuration(available);

    const own = data.reservations.filter((r) => r.tableId === table.id);
    const planned = own
      .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
      .map((r) => ({ start: toMs(r.startAt), end: toMs(r.startAt) + r.serviceMinutes * MINUTE_MS }));
    plannedNum += totalDuration(intersectLists(mergeIntervals(planned), available));

    const availableElapsed = intersectLists(available, elapsed);
    realizedDen += totalDuration(availableElapsed);
    const real = own.flatMap((r): Interval[] => {
      if (r.status === 'completed' && r.completedAt) {
        return [{ start: toMs(r.seatedAt ?? r.startAt), end: toMs(r.completedAt) }];
      }
      if (r.status === 'seated' && r.seatedAt) return [{ start: toMs(r.seatedAt), end: nowMs }];
      return [];
    });
    realizedNum += totalDuration(intersectLists(mergeIntervals(real), availableElapsed));
  }
  return { planned: ratioOf(plannedNum, plannedDen), realized: ratioOf(realizedNum, realizedDen) };
}

const inServiceMonth = (r: Reservation, month: MonthKey) => parisMonth(toMs(r.startAt)) === month;

export function computeMonthlyMetrics(data: DemoData, month: MonthKey, nowMs: number): MonthlyMetrics {
  const received = data.reservations.filter((r) => parisMonth(toMs(r.createdAt)) === month);
  const serviceMonth = data.reservations.filter((r) => inServiceMonth(r, month));
  const notCancelled = serviceMonth.filter((r) => r.status !== 'cancelled');
  const count = (status: Reservation['status']) => serviceMonth.filter((r) => r.status === status);
  const sumPeople = (list: readonly Reservation[]) => list.reduce((sum, r) => sum + r.partySize, 0);

  const dailyMap = new Map<LocalDate, number>(daysOfMonth(month).map((d) => [d, 0]));
  const weekdayCounts = Array.from({ length: 7 }, () => 0);
  const timeMap = new Map<LocalTime, number>();
  for (const r of notCancelled) {
    const start = toMs(r.startAt);
    const date = parisDate(start);
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1);
    weekdayCounts[weekdayIndex(date)] += 1;
    const time = parisTime(start);
    timeMap.set(time, (timeMap.get(time) ?? 0) + 1);
  }

  const all = computeOccupancy(data, month, nowMs);
  return {
    month,
    received: { total: received.length, laterCancelled: received.filter((r) => r.status === 'cancelled').length },
    expected: {
      total: notCancelled.length,
      confirmed: count('confirmed').length,
      seated: count('seated').length,
      completed: count('completed').length,
      noShow: count('no_show').length,
    },
    peopleExpected: sumPeople(serviceMonth.filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')),
    peopleServed: sumPeople(count('completed')),
    cancellations: { reservations: count('cancelled').length, people: sumPeople(count('cancelled')) },
    noShows: { reservations: count('no_show').length, people: sumPeople(count('no_show')) },
    daily: [...dailyMap.entries()].map(([date, reservations]) => ({ date, reservations })),
    weekdays: weekdayCounts.map((reservations, weekday) => ({ weekday, reservations })),
    startTimes: [...timeMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, reservations]) => ({ time, reservations })),
    occupancy: {
      planned: all.planned,
      realized: all.realized,
      lunch: computeOccupancy(data, month, nowMs, 'lunch').planned,
      dinner: computeOccupancy(data, month, nowMs, 'dinner').planned,
    },
  };
}

export interface DayOverview {
  date: LocalDate;
  expectedReservations: number;
  expectedPeople: number;
  presentReservations: number;
  presentPeople: number;
  completedReservations: number;
  noShows: number;
  cancellations: number;
  activeTables: number;
  freeTablesNow: number;
}

/** Números do dia de Paris; "agora" usa o estado real das mesas. */
export function computeDayOverview(data: DemoData, date: LocalDate, nowMs: number): DayOverview {
  const ofDay = data.reservations.filter((r) => parisDate(toMs(r.startAt)) === date);
  const notCancelled = ofDay.filter((r) => r.status !== 'cancelled');
  const expectedPeopleList = notCancelled.filter((r) => r.status !== 'no_show');
  const seated = data.reservations.filter((r) => r.status === 'seated');
  const activeTables = data.tables.filter((t) => t.active);
  return {
    date,
    expectedReservations: notCancelled.length,
    expectedPeople: expectedPeopleList.reduce((sum, r) => sum + r.partySize, 0),
    presentReservations: seated.length,
    presentPeople: seated.reduce((sum, r) => sum + r.partySize, 0),
    completedReservations: ofDay.filter((r) => r.status === 'completed').length,
    noShows: ofDay.filter((r) => r.status === 'no_show').length,
    cancellations: ofDay.filter((r) => r.status === 'cancelled').length,
    activeTables: activeTables.length,
    freeTablesNow: activeTables.filter((t) => getLiveTableStatus(t, data, nowMs).state === 'free').length,
  };
}
