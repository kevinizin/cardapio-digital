import { DateTime } from 'luxon';
import type { IsoInstant, LocalDate, LocalTime, MonthKey } from './types';

/** Todas as datas e horários do restaurante são de Paris, nunca do computador. */
export const RESTAURANT_ZONE = 'Europe/Paris';
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

const pad2 = (n: number) => String(n).padStart(2, '0');

export function isValidLocalTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function isValidLocalDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const utc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    utc.getUTCFullYear() === Number(y) && utc.getUTCMonth() === Number(m) - 1 && utc.getUTCDate() === Number(d)
  );
}

export function isValidMonthKey(value: string): boolean {
  return MONTH_RE.test(value);
}

export function timeToMinutes(time: LocalTime): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): LocalTime {
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export function toMs(iso: IsoInstant): number {
  return Date.parse(iso);
}

export function toIso(ms: number): IsoInstant {
  return new Date(ms).toISOString();
}

export function parisDateTime(ms: number): DateTime {
  return DateTime.fromMillis(ms, { zone: RESTAURANT_ZONE });
}

const offsetCache = new Map<number, number>();

/**
 * Deslocamento de Paris (minutos) num instante. As mudanças de horário de verão
 * acontecem em horas cheias UTC, então o valor é guardado por hora UTC.
 */
export function parisOffsetMinutes(ms: number): number {
  const bucket = Math.floor(ms / HOUR_MS);
  let offset = offsetCache.get(bucket);
  if (offset === undefined) {
    offset = DateTime.fromMillis(bucket * HOUR_MS, { zone: RESTAURANT_ZONE }).offset;
    offsetCache.set(bucket, offset);
  }
  return offset;
}

const parisIso = (ms: number) => new Date(ms + parisOffsetMinutes(ms) * MINUTE_MS).toISOString();

export function parisDate(ms: number): LocalDate {
  return parisIso(ms).slice(0, 10);
}

export function parisTime(ms: number): LocalTime {
  return parisIso(ms).slice(11, 16);
}

export function parisMonth(ms: number): MonthKey {
  return parisIso(ms).slice(0, 7);
}

/** Minutos desde a meia-noite local de Paris. */
export function parisMinutesOfDay(ms: number): number {
  const iso = parisIso(ms);
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}

/**
 * Converte data e hora locais de Paris num instante (ms).
 * Retorna null para valores inválidos ou para horários inexistentes
 * (o salto de 02:00 para 03:00 na mudança para o horário de verão).
 */
const localCache = new Map<string, number | null>();

export function localToMs(date: LocalDate, time: LocalTime): number | null {
  const key = `${date}T${time}`;
  const cached = localCache.get(key);
  if (cached !== undefined) return cached;
  let result: number | null = null;
  if (isValidLocalDate(date) && isValidLocalTime(time)) {
    const dt = DateTime.fromISO(key, { zone: RESTAURANT_ZONE });
    if (dt.isValid && dt.toFormat('yyyy-MM-dd') === date && dt.toFormat('HH:mm') === time) result = dt.toMillis();
  }
  if (localCache.size > 50_000) localCache.clear();
  localCache.set(key, result);
  return result;
}

function dayNumber(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function fromDayNumber(n: number): LocalDate {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/** Soma dias de calendário (independe de fuso e de horário de verão). */
export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(dayNumber(date) + days);
}

export function diffInDays(from: LocalDate, to: LocalDate): number {
  return dayNumber(to) - dayNumber(from);
}

/** Dia da semana da data local: 0 = segunda-feira … 6 = domingo. */
export function weekdayIndex(date: LocalDate): number {
  const jsDay = new Date(dayNumber(date) * 86_400_000).getUTCDay();
  return (jsDay + 6) % 7;
}

/** Início (inclusivo) e fim (exclusivo) do dia local de Paris; dias de 23 ou 25 horas incluídos. */
export function dayBounds(date: LocalDate): { startMs: number; endMs: number } {
  const start = DateTime.fromISO(date, { zone: RESTAURANT_ZONE }).startOf('day');
  return { startMs: start.toMillis(), endMs: start.plus({ days: 1 }).toMillis() };
}

export function monthOfDate(date: LocalDate): MonthKey {
  return date.slice(0, 7);
}

export function addMonths(month: MonthKey, months: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

export function monthBounds(month: MonthKey): { startMs: number; endMs: number } {
  const start = DateTime.fromISO(`${month}-01`, { zone: RESTAURANT_ZONE }).startOf('month');
  return { startMs: start.toMillis(), endMs: start.plus({ months: 1 }).toMillis() };
}

export function daysOfMonth(month: MonthKey): LocalDate[] {
  const first = `${month}-01`;
  const next = `${addMonths(month, 1)}-01`;
  const count = diffInDays(first, next);
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

export function firstDayOfMonth(month: MonthKey): LocalDate {
  return `${month}-01`;
}
