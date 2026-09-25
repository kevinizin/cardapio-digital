import { DateTime } from 'luxon';
import { RESTAURANT_ZONE } from '../domain/time';
import type { LocalDate, MonthKey } from '../domain/types';
import { INTL_LOCALE, type Locale } from './locale';

/**
 * Formatação de datas e números: sempre 24 horas, dia/mês/ano e fuso de Paris.
 * `createFormatters(locale)` gera o conjunto para cada idioma do site público;
 * as exportações diretas abaixo são as de português (usadas pela administração).
 */
export function createFormatters(locale: Locale) {
  const intl = INTL_LOCALE[locale];
  const zoned = (ms: number) => DateTime.fromMillis(ms, { zone: RESTAURANT_ZONE }).setLocale(intl);
  const fromLocalDate = (date: LocalDate) => DateTime.fromISO(date, { zone: RESTAURANT_ZONE }).setLocale(intl);
  const capitalize = (text: string) => (text ? text.charAt(0).toLocaleUpperCase(intl) + text.slice(1) : text);

  const patterns = {
    pt: { at: "dd/MM/yyyy 'às' HH:mm", long: 'cccc, dd/MM/yyyy', compact: 'ccc, dd/MM', spoken: "cccc, d 'de' LLLL 'de' yyyy", month: "LLLL 'de' yyyy" },
    fr: { at: "dd/MM/yyyy 'à' HH:mm", long: 'cccc dd/MM/yyyy', compact: 'ccc dd/MM', spoken: 'cccc d LLLL yyyy', month: 'LLLL yyyy' },
    en: { at: "dd/MM/yyyy 'at' HH:mm", long: 'cccc, dd/MM/yyyy', compact: 'ccc, dd/MM', spoken: 'cccc d LLLL yyyy', month: 'LLLL yyyy' },
  }[locale];

  const numberFormat = new Intl.NumberFormat(intl);
  const percentFormat = new Intl.NumberFormat(intl, { style: 'percent', maximumFractionDigits: 1 });

  function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${rest} min`;
    if (locale === 'pt') return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`;
    if (locale === 'fr') return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }

  return {
    locale,
    intl,
    capitalize,
    formatTime: (ms: number) => zoned(ms).toFormat('HH:mm'),
    formatDate: (ms: number) => zoned(ms).toFormat('dd/MM/yyyy'),
    formatDateTime: (ms: number) => zoned(ms).toFormat(patterns.at),
    formatShortDateTime: (ms: number) => zoned(ms).toFormat('dd/MM HH:mm'),
    formatLocalDate: (date: LocalDate) => fromLocalDate(date).toFormat('dd/MM/yyyy'),
    /** Ex.: "Terça-feira, 15/09/2026" · "Mardi 15/09/2026" · "Tuesday, 15/09/2026". */
    formatLocalDateLong: (date: LocalDate) => capitalize(fromLocalDate(date).toFormat(patterns.long)),
    /** Ex.: "ter., 15/09" · "mar. 15/09" · "Tue, 15/09". */
    formatLocalDateCompact: (date: LocalDate) => fromLocalDate(date).toFormat(patterns.compact),
    formatLocalDateShort: (date: LocalDate) => fromLocalDate(date).toFormat('dd/MM'),
    formatDayNumber: (date: LocalDate) => fromLocalDate(date).toFormat('d'),
    formatWeekdayLong: (date: LocalDate) => capitalize(fromLocalDate(date).toFormat('cccc')),
    /** Ex.: "terça-feira, 15 de setembro de 2026" (leitores de tela). */
    formatLocalDateSpoken: (date: LocalDate) => fromLocalDate(date).toFormat(patterns.spoken),
    /** Ex.: "Setembro de 2026" · "Septembre 2026" · "September 2026". */
    formatMonth: (month: MonthKey) => capitalize(fromLocalDate(`${month}-01`).toFormat(patterns.month)),
    formatDuration,
    formatNumber: (value: number) => numberFormat.format(Number.isFinite(value) ? value : 0),
    /** Devolve null quando não há como calcular (nunca NaN ou infinito). */
    formatPercent: (ratio: number | null) => (ratio === null || !Number.isFinite(ratio) ? null : percentFormat.format(ratio)),
    formatHours: (minutes: number) => `${numberFormat.format(Math.round(minutes / 60))} h`,
    /** Deslocamento de Paris naquele instante, ex.: "UTC+2" no verão e "UTC+1" no inverno. */
    formatParisOffset: (ms: number) => {
      const offset = zoned(ms).offset / 60;
      return `UTC${offset >= 0 ? '+' : '−'}${Math.abs(offset)}`;
    },
  };
}

export type Formatters = ReturnType<typeof createFormatters>;

export const LOCALE = 'pt-BR';

const pt = createFormatters('pt');

export const {
  capitalize,
  formatTime,
  formatDate,
  formatDateTime,
  formatShortDateTime,
  formatLocalDate,
  formatLocalDateLong,
  formatLocalDateCompact,
  formatLocalDateShort,
  formatDayNumber,
  formatWeekdayLong,
  formatLocalDateSpoken,
  formatMonth,
  formatDuration,
  formatNumber,
  formatPercent,
  formatHours,
  formatParisOffset,
} = pt;
