import { DateTime } from 'luxon';
import { RESTAURANT_ZONE } from '../domain/time';
import type { LocalDate, MonthKey } from '../domain/types';

/** Formatação de datas e números: sempre 24 horas, dia/mês/ano e fuso de Paris. */
export const LOCALE = 'pt-BR';

const zoned = (ms: number) => DateTime.fromMillis(ms, { zone: RESTAURANT_ZONE }).setLocale(LOCALE);
const fromLocalDate = (date: LocalDate) => DateTime.fromISO(date, { zone: RESTAURANT_ZONE }).setLocale(LOCALE);

export const capitalize = (text: string) => (text ? text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1) : text);

export const formatTime = (ms: number) => zoned(ms).toFormat('HH:mm');
export const formatDate = (ms: number) => zoned(ms).toFormat('dd/MM/yyyy');
export const formatDateTime = (ms: number) => zoned(ms).toFormat("dd/MM/yyyy 'às' HH:mm");
export const formatShortDateTime = (ms: number) => zoned(ms).toFormat('dd/MM HH:mm');

export const formatLocalDate = (date: LocalDate) => fromLocalDate(date).toFormat('dd/MM/yyyy');
/** Ex.: "Terça-feira, 15/09/2026". */
export const formatLocalDateLong = (date: LocalDate) => capitalize(fromLocalDate(date).toFormat('cccc, dd/MM/yyyy'));
/** Ex.: "ter., 15/09". */
export const formatLocalDateCompact = (date: LocalDate) => fromLocalDate(date).toFormat('ccc, dd/MM');
export const formatLocalDateShort = (date: LocalDate) => fromLocalDate(date).toFormat('dd/MM');
export const formatDayNumber = (date: LocalDate) => fromLocalDate(date).toFormat('d');
export const formatWeekdayLong = (date: LocalDate) => capitalize(fromLocalDate(date).toFormat('cccc'));
/** Ex.: "terça-feira, 15 de setembro de 2026" (leitores de tela). */
export const formatLocalDateSpoken = (date: LocalDate) => fromLocalDate(date).toFormat("cccc, d 'de' LLLL 'de' yyyy");

/** Ex.: "Setembro de 2026". */
export const formatMonth = (month: MonthKey) => capitalize(fromLocalDate(`${month}-01`).toFormat("LLLL 'de' yyyy"));

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${String(rest).padStart(2, '0')}`;
}

const numberFormat = new Intl.NumberFormat(LOCALE);
const percentFormat = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 });

export const formatNumber = (value: number) => numberFormat.format(Number.isFinite(value) ? value : 0);

/** Devolve null quando não há como calcular (nunca NaN ou infinito). */
export const formatPercent = (ratio: number | null) =>
  ratio === null || !Number.isFinite(ratio) ? null : percentFormat.format(ratio);

export const formatHours = (minutes: number) => `${numberFormat.format(Math.round(minutes / 60))} h`;

/** Deslocamento de Paris naquele instante, ex.: "UTC+2" no verão e "UTC+1" no inverno. */
export function formatParisOffset(ms: number): string {
  const offset = zoned(ms).offset / 60;
  return `UTC${offset >= 0 ? '+' : '−'}${Math.abs(offset)}`;
}
