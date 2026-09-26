/**
 * Feriados nacionais da França (os 11 válidos em todo o país). A lista vem do
 * servidor (Nager.Date); este cálculo local serve à demonstração, ao nome em
 * português de cada feriado e de reserva quando o serviço externo falha.
 */
import { addDays } from './time';
import type { LocalDate } from './types';

export interface Holiday {
  date: LocalDate;
  /** Nome em francês (ex.: "Fête nationale"). */
  localName: string;
  /** Nome em inglês, como o Nager.Date devolve (ex.: "Bastille Day"). */
  name: string;
}

export interface HolidayWithPt extends Holiday {
  /** Nome em português para a administração (ex.: "Festa Nacional (14 de julho)"). */
  ptName: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Domingo de Páscoa (algoritmo anônimo gregoriano / Meeus–Jones–Butcher). */
export function easterSunday(year: number): LocalDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Os 11 feriados nacionais franceses de um ano, em ordem de data. */
export function frenchHolidays(year: number): HolidayWithPt[] {
  const easter = easterSunday(year);
  const fixed = (md: string) => `${year}-${md}`;
  const list: HolidayWithPt[] = [
    { date: fixed('01-01'), localName: 'Jour de l’an', name: "New Year's Day", ptName: 'Ano-Novo (1º de janeiro)' },
    { date: addDays(easter, 1), localName: 'Lundi de Pâques', name: 'Easter Monday', ptName: 'Segunda-feira de Páscoa' },
    { date: fixed('05-01'), localName: 'Fête du Travail', name: 'Labour Day', ptName: 'Dia do Trabalho (1º de maio)' },
    { date: fixed('05-08'), localName: 'Victoire 1945', name: 'Victory in Europe Day', ptName: 'Vitória de 1945 (8 de maio)' },
    { date: addDays(easter, 39), localName: 'Ascension', name: 'Ascension Day', ptName: 'Ascensão' },
    { date: addDays(easter, 50), localName: 'Lundi de Pentecôte', name: 'Whit Monday', ptName: 'Segunda-feira de Pentecostes' },
    { date: fixed('07-14'), localName: 'Fête nationale', name: 'Bastille Day', ptName: 'Festa Nacional (14 de julho)' },
    { date: fixed('08-15'), localName: 'Assomption', name: 'Assumption Day', ptName: 'Assunção (15 de agosto)' },
    { date: fixed('11-01'), localName: 'Toussaint', name: "All Saints' Day", ptName: 'Todos os Santos (1º de novembro)' },
    { date: fixed('11-11'), localName: 'Armistice 1918', name: 'Armistice Day', ptName: 'Armistício de 1918 (11 de novembro)' },
    { date: fixed('12-25'), localName: 'Noël', name: 'Christmas Day', ptName: 'Natal (25 de dezembro)' },
  ];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Nome em português de um feriado recebido do servidor: pela data (os 11
 * nacionais) e, se não bater, pelo nome em francês; senão, o próprio nome francês.
 */
export function portugueseHolidayName(holiday: Holiday): string {
  const year = Number(holiday.date.slice(0, 4));
  const known = Number.isInteger(year) ? frenchHolidays(year) : [];
  const normalize = (text: string) => text.toLowerCase().replace(/[’']/g, "'").trim();
  return (
    known.find((h) => h.date === holiday.date)?.ptName ??
    known.find((h) => normalize(h.localName) === normalize(holiday.localName))?.ptName ??
    holiday.localName
  );
}

/** Feriados de `from` até `to` (inclusive), com o nome em português. */
export function holidaysBetween(holidays: readonly Holiday[], from: LocalDate, to: LocalDate): HolidayWithPt[] {
  const seen = new Set<string>();
  return holidays
    .filter((h) => h.date >= from && h.date <= to)
    .filter((h) => (seen.has(h.date) ? false : (seen.add(h.date), true)))
    .map((h) => ({ ...h, ptName: portugueseHolidayName(h) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
