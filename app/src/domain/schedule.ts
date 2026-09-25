import {
  addDays,
  isValidLocalTime,
  localToMs,
  MINUTE_MS,
  minutesToTime,
  parisDate,
  parisMinutesOfDay,
  timeToMinutes,
  weekdayIndex,
} from './time';
import { SHIFT_KINDS } from './types';
import type { DateException, DayRule, LocalDate, LocalTime, Settings, ShiftKind, WeeklyRules } from './types';

export interface ResolvedShift {
  kind: ShiftKind;
  date: LocalDate;
  start: LocalTime;
  end: LocalTime;
  startMs: number;
  endMs: number;
}

export type DayStatus = 'past' | 'closed' | 'beyond_window' | 'open';

/** Grade semanal vigente numa data (a versão mais recente com início até a data). */
export function weeklyRulesForDate(settings: Settings, date: LocalDate): WeeklyRules {
  const versions = [...settings.weeklyVersions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let chosen = versions[0];
  for (const version of versions) {
    if (version.effectiveFrom <= date) chosen = version;
  }
  return chosen.weekly;
}

export function currentWeeklyRules(settings: Settings): WeeklyRules {
  const versions = [...settings.weeklyVersions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return versions[versions.length - 1].weekly;
}

export function findException(settings: Settings, date: LocalDate): DateException | undefined {
  return settings.exceptions.find((exception) => exception.date === date);
}

export function dayRuleForDate(settings: Settings, date: LocalDate): { rule: DayRule | null; exception?: DateException } {
  const exception = findException(settings, date);
  if (exception) {
    return { rule: exception.closed ? null : { lunch: exception.lunch, dinner: exception.dinner }, exception };
  }
  return { rule: weeklyRulesForDate(settings, date)[weekdayIndex(date)] };
}

// Configurações são imutáveis (cada alteração cria um novo objeto), então o cache por identidade é seguro.
const shiftCache = new WeakMap<Settings, Map<LocalDate, ResolvedShift[]>>();
const slotCache = new WeakMap<ResolvedShift, Map<string, number[]>>();

/** Turnos abertos numa data de Paris, já convertidos em instantes. */
export function getShiftsForDate(settings: Settings, date: LocalDate): ResolvedShift[] {
  let byDate = shiftCache.get(settings);
  if (!byDate) {
    byDate = new Map();
    shiftCache.set(settings, byDate);
  }
  const cached = byDate.get(date);
  if (cached) return cached;
  const shifts = resolveShifts(settings, date);
  byDate.set(date, shifts);
  return shifts;
}

function resolveShifts(settings: Settings, date: LocalDate): ResolvedShift[] {
  const { rule } = dayRuleForDate(settings, date);
  if (!rule) return [];
  const shifts: ResolvedShift[] = [];
  for (const kind of SHIFT_KINDS) {
    const config = rule[kind];
    if (!config.enabled || !isValidLocalTime(config.start) || !isValidLocalTime(config.end)) continue;
    const startMs = localToMs(date, config.start);
    const endMs = localToMs(date, config.end);
    if (startMs === null || endMs === null || startMs >= endMs) continue;
    shifts.push({ kind, date, start: config.start, end: config.end, startMs, endMs });
  }
  return shifts;
}

export function lastBookableDate(settings: Settings, nowMs: number): LocalDate {
  return addDays(parisDate(nowMs), settings.rules.bookingWindowDays);
}

/** Situação do dia para reservas: passado, fechado, fora da janela ou aberto. */
export function getDayStatus(settings: Settings, date: LocalDate, nowMs: number): DayStatus {
  const today = parisDate(nowMs);
  if (date < today) return 'past';
  if (date > lastBookableDate(settings, nowMs)) return 'beyond_window';
  if (getShiftsForDate(settings, date).length === 0) return 'closed';
  return 'open';
}

/**
 * Inícios possíveis num turno: grade alinhada ao relógio (a cada N minutos)
 * e somente quando atendimento + preparação cabem inteiros até o fim do turno.
 */
export function slotStartsForShift(shift: ResolvedShift, intervalMinutes: number, blockMinutes: number): number[] {
  const key = `${intervalMinutes}|${blockMinutes}`;
  let byKey = slotCache.get(shift);
  if (!byKey) {
    byKey = new Map();
    slotCache.set(shift, byKey);
  }
  const cached = byKey.get(key);
  if (cached) return cached;
  const starts: number[] = [];
  const firstMinute = Math.ceil(timeToMinutes(shift.start) / intervalMinutes) * intervalMinutes;
  for (let minute = firstMinute; minute < 24 * 60; minute += intervalMinutes) {
    const startMs = localToMs(shift.date, minutesToTime(minute));
    if (startMs === null || startMs < shift.startMs) continue;
    if (startMs + blockMinutes * MINUTE_MS > shift.endMs) break;
    starts.push(startMs);
  }
  byKey.set(key, starts);
  return starts;
}

export function isOnGrid(ms: number, intervalMinutes: number): boolean {
  return ms % MINUTE_MS === 0 && parisMinutesOfDay(ms) % intervalMinutes === 0;
}

/** Turno que contém inteiramente o intervalo [start, end), se houver. */
export function findShiftForInterval(settings: Settings, startMs: number, endMs: number): ResolvedShift | null {
  const date = parisDate(startMs);
  return getShiftsForDate(settings, date).find((s) => startMs >= s.startMs && endMs <= s.endMs) ?? null;
}

/** Turno em que um instante cai (início incluído, fim excluído). */
export function shiftAt(settings: Settings, ms: number): ResolvedShift | null {
  return getShiftsForDate(settings, parisDate(ms)).find((s) => ms >= s.startMs && ms < s.endMs) ?? null;
}

/** Turno em andamento agora ou o próximo turno aberto (até `searchDays` adiante). */
export function currentOrNextShift(
  settings: Settings,
  nowMs: number,
  searchDays = 21,
): { shift: ResolvedShift; isCurrent: boolean } | null {
  const today = parisDate(nowMs);
  for (let offset = 0; offset <= searchDays; offset += 1) {
    for (const shift of getShiftsForDate(settings, addDays(today, offset))) {
      if (nowMs >= shift.startMs && nowMs < shift.endMs) return { shift, isCurrent: true };
      if (shift.startMs > nowMs) return { shift, isCurrent: false };
    }
  }
  return null;
}
