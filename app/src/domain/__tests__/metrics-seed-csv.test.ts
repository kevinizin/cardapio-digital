import { describe, expect, it } from 'vitest';
import { escapeCsvField, toCsv } from '../csv';
import { overlaps } from '../intervals';
import { computeMonthlyMetrics, computeOccupancy, tableActiveIntervals } from '../metrics';
import { blockSegment, reservationSegments, type OccupancySegment } from '../occupancy';
import { createDemoData } from '../seed';
import { addDays, monthBounds, parisDate, parisMonth, toMs } from '../time';
import type { DemoData, Table } from '../types';
import { at, baseData, iso, makeBlock, makeReservation } from './fixtures';

describe('dashboard mensal', () => {
  const data = baseData({
    reservations: [
      makeReservation({ tableId: 'M05', partySize: 4, status: 'completed', createdAt: iso('2026-09-28', '10:00'), startAt: iso('2026-10-02', '19:00'), seatedAt: iso('2026-10-02', '19:00'), completedAt: iso('2026-10-02', '20:20') }),
      makeReservation({ tableId: 'M01', partySize: 2, status: 'cancelled', createdAt: iso('2026-10-05', '10:00'), startAt: iso('2026-10-06', '19:00') }),
      makeReservation({ tableId: 'M06', partySize: 3, status: 'no_show', createdAt: iso('2026-10-10', '10:00'), startAt: iso('2026-10-13', '12:00') }),
      makeReservation({ tableId: 'M02', partySize: 2, status: 'confirmed', createdAt: iso('2026-10-20', '10:00'), startAt: iso('2026-11-03', '19:00') }),
      makeReservation({ tableId: 'M11', partySize: 5, status: 'confirmed', createdAt: iso('2026-10-01', '10:00'), startAt: iso('2026-10-08', '20:00') }),
    ],
  });
  const now = at('2026-10-07', '10:00');

  it('separa mês de criação e mês de atendimento, reservas e pessoas', () => {
    const october = computeMonthlyMetrics(data, '2026-10', now);
    expect(october.received).toEqual({ total: 4, laterCancelled: 1 });
    expect(october.expected).toEqual({ total: 3, confirmed: 1, seated: 0, completed: 1, noShow: 1 });
    expect(october.peopleExpected).toBe(9); // 4 (concluída) + 5 (confirmada); sem cancelada e ausência
    expect(october.peopleServed).toBe(4);
    expect(october.cancellations).toEqual({ reservations: 1, people: 2 });
    expect(october.noShows).toEqual({ reservations: 1, people: 3 });
    expect(october.daily.reduce((s, d) => s + d.reservations, 0)).toBe(3);
    expect(october.weekdays.reduce((s, d) => s + d.reservations, 0)).toBe(3);
    expect(october.startTimes).toEqual([
      { time: '12:00', reservations: 1 },
      { time: '19:00', reservations: 1 },
      { time: '20:00', reservations: 1 },
    ]);

    const september = computeMonthlyMetrics(data, '2026-09', now);
    expect(september.received.total).toBe(1); // criada em setembro para atendimento em outubro
    expect(september.expected.total).toBe(0);
    const november = computeMonthlyMetrics(data, '2026-11', now);
    expect(november.expected.confirmed).toBe(1);
  });

  it('ocupação planejada recorta turnos e desconta bloqueios e fechamentos sem dupla subtração', () => {
    const single: Table[] = [{ id: 'M01', capacity: 2, area: 'salao', active: true }];
    const d = baseData({
      tables: single,
      reservations: [
        makeReservation({ tableId: 'M01', status: 'completed', startAt: iso('2026-09-05', '19:00'), seatedAt: iso('2026-09-05', '19:00'), completedAt: iso('2026-09-05', '20:30') }),
        makeReservation({ tableId: 'M01', status: 'cancelled', startAt: iso('2026-09-06', '19:00') }),
        makeReservation({ tableId: 'M01', status: 'no_show', startAt: iso('2026-09-09', '19:00') }),
      ],
      blocks: [
        makeBlock({ tableId: 'M01', startAt: iso('2026-09-03', '10:00'), endAt: iso('2026-09-03', '16:00') }), // cobre o almoço (180)
        makeBlock({ tableId: 'M01', startAt: iso('2026-09-02', '19:00'), endAt: iso('2026-09-02', '23:00') }), // dia já fechado
        makeBlock({ tableId: 'M01', startAt: iso('2026-09-04', '19:00'), endAt: iso('2026-09-04', '21:00') }),
        makeBlock({ tableId: 'M01', startAt: iso('2026-09-04', '20:00'), endAt: iso('2026-09-04', '22:00') }), // sobreposto: união 180
      ],
    });
    d.settings.exceptions.push({ id: 'x', date: '2026-09-02', closed: true, lunch: { enabled: true, start: '12:00', end: '15:00' }, dinner: { enabled: true, start: '19:00', end: '23:00' }, note: '' });
    // Setembro/2026: 26 dias abertos × 420 min = 10.920; −420 (fechado) −180 (almoço) −180 (união) = 10.140.
    const { planned } = computeOccupancy(d, '2026-09', at('2026-10-01', '00:00'));
    expect(planned.denominatorMinutes).toBe(10_140);
    expect(planned.numeratorMinutes).toBe(90); // só atendimento; sem preparação, canceladas ou ausências
    expect(planned.ratio).toBeCloseTo(90 / 10_140, 10);
  });

  it('denominador zero mostra indisponível, sem NaN nem infinito', () => {
    const d = baseData();
    d.tables.forEach((t) => (t.active = false));
    const metrics = computeMonthlyMetrics(d, '2026-09', at('2026-09-15', '10:00'));
    expect(metrics.occupancy.planned).toEqual({ numeratorMinutes: 0, denominatorMinutes: 0, ratio: null });
    expect(metrics.occupancy.realized.ratio).toBeNull();
    const future = computeMonthlyMetrics(baseData(), '2027-01', at('2026-09-15', '10:00'));
    expect(future.occupancy.realized).toEqual({ numeratorMinutes: 0, denominatorMinutes: 0, ratio: null });
    expect(Number.isNaN(future.occupancy.planned.ratio)).toBe(false);
  });

  it('considera períodos de mesa ativa pelo registro de ativações', () => {
    const table: Table = { id: 'M01', capacity: 2, area: 'salao', active: true };
    const bounds = monthBounds('2026-09');
    const range = { start: bounds.startMs, end: bounds.endMs };
    const events = [
      { tableId: 'M01', active: false, at: '2026-09-10T10:00:00.000Z' },
      { tableId: 'M01', active: true, at: '2026-09-20T10:00:00.000Z' },
    ];
    expect(tableActiveIntervals(table, events, range)).toEqual([
      { start: range.start, end: Date.parse('2026-09-10T10:00:00.000Z') },
      { start: Date.parse('2026-09-20T10:00:00.000Z'), end: range.end },
    ]);
  });
});

function assertNoConflicts(data: DemoData, nowMs: number) {
  for (const table of data.tables) {
    const segments: OccupancySegment[] = [
      ...data.reservations.filter((r) => r.tableId === table.id).flatMap((r) => reservationSegments(r, nowMs)),
      ...data.blocks.filter((b) => b.tableId === table.id).map(blockSegment),
    ].sort((a, b) => a.start - b.start);
    for (let i = 1; i < segments.length; i += 1) {
      const clash = segments.slice(0, i).find((s) => s.reservationId !== segments[i].reservationId && overlaps(s, segments[i]));
      expect(clash, `conflito na mesa ${table.id}`).toBeUndefined();
    }
  }
}

describe('dados fictícios', () => {
  const scenarios = {
    'terça durante o jantar': at('2026-09-15', '20:10'),
    'segunda (fechado)': at('2026-09-14', '20:17'),
    'sábado no almoço': at('2026-09-19', '13:05'),
    'domingo da mudança de horário': at('2026-03-29', '21:30'),
    'véspera de ano-novo tarde da noite': at('2026-12-31', '23:30'),
  };

  for (const [label, nowMs] of Object.entries(scenarios)) {
    it(`gera histórico coerente e sem conflitos (${label})`, () => {
      const data = createDemoData(nowMs);
      assertNoConflicts(data, nowMs);
      const today = parisDate(nowMs);
      const codes = new Set(data.reservations.map((r) => r.code));
      expect(codes.size).toBe(data.reservations.length);
      expect(data.reservations.length).toBeGreaterThan(800);
      for (const r of data.reservations) {
        const start = toMs(r.startAt);
        expect(r.customer.email.endsWith('@example.com')).toBe(true);
        expect(toMs(r.createdAt)).toBeLessThanOrEqual(nowMs);
        expect(toMs(r.createdAt)).toBeLessThanOrEqual(start);
        expect(parisDate(start) <= addDays(today, data.settings.rules.bookingWindowDays)).toBe(true);
        if (start > nowMs) expect(['confirmed', 'cancelled']).toContain(r.status);
        if (r.status === 'completed') {
          expect(toMs(r.seatedAt!)).toBeLessThanOrEqual(toMs(r.completedAt!));
          expect(toMs(r.completedAt!)).toBeLessThanOrEqual(nowMs);
        }
        if (r.status === 'cancelled') expect(toMs(r.cancelledAt!)).toBeGreaterThanOrEqual(toMs(r.createdAt));
        if (r.status === 'no_show') expect(toMs(r.noShowAt!)).toBeLessThanOrEqual(nowMs);
      }
      const statuses = new Set(data.reservations.map((r) => r.status));
      for (const status of ['completed', 'cancelled', 'no_show', 'confirmed']) expect(statuses).toContain(status);
      expect(new Set(data.reservations.map((r) => r.source))).toEqual(new Set(['online', 'phone', 'walk_in']));
      expect(new Set(data.reservations.map((r) => r.partySize))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
      expect(data.reservations.some((r) => parisMonth(toMs(r.createdAt)) < parisMonth(toMs(r.startAt)))).toBe(true);
    });
  }

  it('é determinístico e mostra atendimento em andamento quando o horário permite', () => {
    const nowMs = scenarios['terça durante o jantar'];
    expect(createDemoData(nowMs)).toEqual(createDemoData(nowMs));
    const data = createDemoData(nowMs);
    const today = data.reservations.filter((r) => parisDate(toMs(r.startAt)) === '2026-09-15');
    expect(today.some((r) => r.status === 'seated')).toBe(true);
    expect(data.blocks.some((b) => toMs(b.startAt) <= nowMs && nowMs < toMs(b.endAt))).toBe(true);
    const closed = createDemoData(scenarios['segunda (fechado)']);
    expect(closed.reservations.some((r) => r.status === 'seated')).toBe(false);
  });

  it('tem dias de alta e de baixa ocupação no histórico', () => {
    const nowMs = scenarios['terça durante o jantar'];
    const data = createDemoData(nowMs);
    const perDay = new Map<string, number>();
    for (const r of data.reservations) {
      if (r.status === 'cancelled' || toMs(r.startAt) > nowMs) continue;
      const day = parisDate(toMs(r.startAt));
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    const counts = [...perDay.values()].sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)];
    expect(counts.at(-1)).toBeGreaterThanOrEqual(Math.max(24, median * 1.3));
    expect(counts[0]).toBeLessThanOrEqual(median * 0.5);
  });
});

describe('CSV seguro para planilhas', () => {
  it('protege contra fórmulas', () => {
    expect(escapeCsvField('=SOMA(A1:A2)')).toBe("'=SOMA(A1:A2)");
    expect(escapeCsvField('+33 6 39 98 00 00')).toBe("'+33 6 39 98 00 00");
    expect(escapeCsvField('-10')).toBe("'-10");
    expect(escapeCsvField('@comando')).toBe("'@comando");
    expect(escapeCsvField('  =1+1')).toBe("'  =1+1");
    expect(escapeCsvField('\tcmd')).toBe("'\tcmd");
  });

  it('escapa separador, aspas e quebras de linha', () => {
    expect(escapeCsvField('a;b')).toBe('"a;b"');
    expect(escapeCsvField('disse "olá"')).toBe('"disse ""olá"""');
    expect(escapeCsvField('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
    expect(escapeCsvField(4)).toBe('4');
    expect(escapeCsvField(null)).toBe('');
    expect(toCsv([['código', 'nome'], ['ABCD-EFGH', 'Ana; Teste']])).toBe('código;nome\r\nABCD-EFGH;"Ana; Teste"');
  });
});
