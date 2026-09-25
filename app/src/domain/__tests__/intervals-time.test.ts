import { describe, expect, it } from 'vitest';
import { intersectLists, mergeIntervals, overlaps, subtractIntervals, totalDuration } from '../intervals';
import {
  addDays,
  addMonths,
  dayBounds,
  daysOfMonth,
  HOUR_MS,
  localToMs,
  parisDate,
  parisTime,
  toIso,
  weekdayIndex,
} from '../time';
import { at } from './fixtures';

describe('intervalos semiabertos [início, fim)', () => {
  it('detecta conflito quando inícioA < fimB e inícioB < fimA', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(true);
    expect(overlaps({ start: 5, end: 15 }, { start: 0, end: 10 })).toBe(true);
    expect(overlaps({ start: 0, end: 20 }, { start: 5, end: 6 })).toBe(true);
  });

  it('permite intervalos adjacentes (fim de um igual ao início do outro)', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
    expect(overlaps({ start: 10, end: 20 }, { start: 0, end: 10 })).toBe(false);
  });

  it('une, intersecta e subtrai sem contar trechos duas vezes', () => {
    expect(mergeIntervals([{ start: 5, end: 8 }, { start: 0, end: 6 }, { start: 8, end: 9 }])).toEqual([{ start: 0, end: 9 }]);
    expect(totalDuration([{ start: 0, end: 10 }, { start: 5, end: 15 }])).toBe(15);
    expect(intersectLists([{ start: 0, end: 10 }, { start: 20, end: 30 }], [{ start: 5, end: 25 }])).toEqual([
      { start: 5, end: 10 },
      { start: 20, end: 25 },
    ]);
    expect(subtractIntervals([{ start: 0, end: 30 }], [{ start: 5, end: 10 }, { start: 8, end: 12 }, { start: 25, end: 40 }])).toEqual([
      { start: 0, end: 5 },
      { start: 12, end: 25 },
    ]);
  });
});

describe('fuso Europe/Paris independente do computador', () => {
  it('os testes rodam propositalmente fora do fuso de Paris', () => {
    // São Paulo (UTC-3, sem horário de verão)
    expect(new Date(2026, 6, 1, 12).getTimezoneOffset()).toBe(180);
  });

  it('converte horário local de Paris no verão (UTC+2) e no inverno (UTC+1)', () => {
    expect(toIso(at('2026-09-15', '19:00'))).toBe('2026-09-15T17:00:00.000Z');
    expect(toIso(at('2026-11-10', '19:00'))).toBe('2026-11-10T18:00:00.000Z');
  });

  it('trata os dias de mudança de horário', () => {
    // 25/10/2026: fim do horário de verão (dia de 25 horas)
    expect(toIso(at('2026-10-25', '12:00'))).toBe('2026-10-25T11:00:00.000Z');
    const autumn = dayBounds('2026-10-25');
    expect(autumn.endMs - autumn.startMs).toBe(25 * HOUR_MS);
    // 29/03/2026: início do horário de verão (dia de 23 horas; 02:30 não existe)
    const spring = dayBounds('2026-03-29');
    expect(spring.endMs - spring.startMs).toBe(23 * HOUR_MS);
    expect(localToMs('2026-03-29', '02:30')).toBeNull();
  });

  it('usa a data de Paris mesmo quando no computador ainda é o dia anterior', () => {
    const ms = Date.parse('2026-09-15T22:30:00.000Z'); // 19:30 em São Paulo, 00:30 do dia 16 em Paris
    expect(parisDate(ms)).toBe('2026-09-16');
    expect(parisTime(ms)).toBe('00:30');
  });

  it('calcula dias da semana, somas de dias e meses no calendário', () => {
    expect(weekdayIndex('2026-09-14')).toBe(0); // segunda-feira
    expect(weekdayIndex('2026-09-20')).toBe(6); // domingo
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(daysOfMonth('2026-02')).toHaveLength(28);
    expect(daysOfMonth('2026-09')[0]).toBe('2026-09-01');
  });
});
