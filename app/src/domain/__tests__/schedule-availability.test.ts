import { describe, expect, it } from 'vitest';
import { findNextAvailableDates, getDayAvailability } from '../availability';
import { getDayStatus, getShiftsForDate, slotStartsForShift } from '../schedule';
import { parisTime } from '../time';
import { at, baseData, iso, makeBlock, makeReservation } from './fixtures';

const NOW = at('2026-09-15', '10:00'); // terça-feira

const times = (list: number[]) => list.map(parisTime);
const slotsOf = (day: ReturnType<typeof getDayAvailability>, kind: 'lunch' | 'dinner') =>
  day.shifts.find((s) => s.shift.kind === kind)?.slots ?? [];

describe('turnos e grade de horários', () => {
  it('segunda fechado; terça a domingo com almoço e jantar', () => {
    const { settings } = baseData();
    expect(getShiftsForDate(settings, '2026-09-14')).toEqual([]);
    const tuesday = getShiftsForDate(settings, '2026-09-15');
    expect(tuesday.map((s) => `${s.kind} ${s.start}-${s.end}`)).toEqual(['lunch 12:00-15:00', 'dinner 19:00-23:00']);
  });

  it('atendimento + preparação cabem no fim do turno (grade de 15 min)', () => {
    const [lunch, dinner] = getShiftsForDate(baseData().settings, '2026-09-15');
    expect(times(slotStartsForShift(lunch, 15, 110))).toEqual(['12:00', '12:15', '12:30', '12:45', '13:00']);
    const dinnerSlots = times(slotStartsForShift(dinner, 15, 110));
    expect(dinnerSlots[0]).toBe('19:00');
    expect(dinnerSlots[dinnerSlots.length - 1]).toBe('21:00'); // 21:00 + 1h50 = 22:50; 21:15 terminaria 23:05
    expect(dinnerSlots).toHaveLength(9);
  });

  it('alinha a grade ao relógio quando o turno começa fora dela', () => {
    const data = baseData();
    data.settings.exceptions.push({
      id: 'exc1',
      date: '2026-09-16',
      closed: false,
      lunch: { enabled: true, start: '12:10', end: '15:00' },
      dinner: { enabled: false, start: '19:00', end: '23:00' },
      note: '',
    });
    const [lunch] = getShiftsForDate(data.settings, '2026-09-16');
    expect(times(slotStartsForShift(lunch, 15, 110))).toEqual(['12:15', '12:30', '12:45', '13:00']);
  });

  it('exceções fecham datas ou mudam horários', () => {
    const data = baseData();
    data.settings.exceptions.push(
      { id: 'a', date: '2026-09-17', closed: true, lunch: { enabled: true, start: '12:00', end: '15:00' }, dinner: { enabled: true, start: '19:00', end: '23:00' }, note: '' },
      { id: 'b', date: '2026-09-18', closed: false, lunch: { enabled: false, start: '12:00', end: '15:00' }, dinner: { enabled: true, start: '18:30', end: '23:30' }, note: '' },
    );
    expect(getShiftsForDate(data.settings, '2026-09-17')).toEqual([]);
    const special = getShiftsForDate(data.settings, '2026-09-18');
    expect(special).toHaveLength(1);
    expect(times(slotStartsForShift(special[0], 15, 110)).at(-1)).toBe('21:30');
  });

  it('dia passado, fechado ou fora da janela de 60 dias fica indisponível', () => {
    const { settings } = baseData();
    expect(getDayStatus(settings, '2026-09-14', NOW)).toBe('past');
    expect(getDayStatus(settings, '2026-09-15', NOW)).toBe('open');
    expect(getDayStatus(settings, '2026-09-21', NOW)).toBe('closed');
    expect(getDayStatus(settings, '2026-11-14', NOW)).toBe('open'); // 60 dias adiante (sábado)
    expect(getDayStatus(settings, '2026-11-15', NOW)).toBe('beyond_window');
  });
});

describe('disponibilidade e atribuição automática de mesa', () => {
  it('atribui a menor mesa que comporta o grupo, com desempate pela identificação', () => {
    const data = baseData();
    const pick = (party: number) => slotsOf(getDayAvailability(data, '2026-09-15', party, NOW), 'dinner')[0].tableId;
    expect(pick(1)).toBe('M01');
    expect(pick(2)).toBe('M01');
    expect(pick(3)).toBe('M05');
    expect(pick(4)).toBe('M05');
    expect(pick(5)).toBe('M11');
    expect(pick(6)).toBe('M11');
  });

  it('grupos acima do limite online não recebem horários', () => {
    const day = getDayAvailability(baseData(), '2026-09-15', 7, NOW);
    expect(day.partyStatus).toBe('above_online_limit');
    expect(day.totalSlots).toBe(0);
  });

  it('respeita a antecedência mínima de 30 minutos no canal online', () => {
    const day = getDayAvailability(baseData(), '2026-09-15', 2, at('2026-09-15', '11:40'));
    expect(slotsOf(day, 'lunch').map((s) => s.time)).toEqual(['12:15', '12:30', '12:45', '13:00']);
  });

  it('reservas e preparação bloqueiam a mesa; a próxima menor mesa livre é usada', () => {
    const data = baseData({
      reservations: ['M01', 'M02', 'M03', 'M04'].map((tableId) => makeReservation({ tableId, startAt: iso('2026-09-15', '19:00') })),
    });
    const dinner = slotsOf(getDayAvailability(data, '2026-09-15', 2, NOW), 'dinner');
    expect(dinner.find((s) => s.time === '19:00')?.tableId).toBe('M05');
    expect(dinner.find((s) => s.time === '20:45')?.tableId).toBe('M05'); // M01–M04 em preparação até 20:50
    expect(dinner.find((s) => s.time === '21:00')?.tableId).toBe('M01');
  });

  it('permite começar exatamente quando termina a preparação anterior', () => {
    const data = baseData({
      reservations: [makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '19:00'), prepMinutes: 30 })], // bloqueia até 21:00
    });
    const dinner = slotsOf(getDayAvailability(data, '2026-09-15', 2, NOW), 'dinner');
    expect(dinner.find((s) => s.time === '20:45')?.tableId).toBe('M02');
    expect(dinner.find((s) => s.time === '21:00')?.tableId).toBe('M01');
  });

  it('cancelamentos e ausências liberam o período', () => {
    const data = baseData({
      reservations: [
        makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '19:00'), status: 'cancelled' }),
        makeReservation({ tableId: 'M02', startAt: iso('2026-09-15', '19:00'), status: 'no_show' }),
      ],
    });
    const dinner = slotsOf(getDayAvailability(data, '2026-09-15', 2, NOW), 'dinner');
    expect(dinner.find((s) => s.time === '19:00')?.tableId).toBe('M01');
  });

  it('bloqueios manuais participam da mesma validação', () => {
    const data = baseData({
      blocks: [makeBlock({ tableId: 'M01', startAt: iso('2026-09-15', '19:00'), endAt: iso('2026-09-15', '23:00') })],
    });
    expect(slotsOf(getDayAvailability(data, '2026-09-15', 2, NOW), 'dinner')[0].tableId).toBe('M02');
  });

  it('mesa ocupada não é liberada só porque passou o término previsto', () => {
    const seated = makeReservation({
      tableId: 'M01',
      startAt: iso('2026-09-15', '19:00'),
      status: 'seated',
      seatedAt: iso('2026-09-15', '19:05'),
    });
    const data = baseData({ reservations: [seated] });
    // Às 20:40 o término projetado é 20:40 + 20 min de preparação = 21:00 (adjacente ao horário das 21:00).
    const at2040 = slotsOf(getDayAvailability(data, '2026-09-15', 2, at('2026-09-15', '20:40'), 'admin'), 'dinner');
    expect(at2040.find((s) => s.time === '21:00')?.tableId).toBe('M01');
    // Às 20:50 a mesa só liberaria às 21:10: o horário das 21:00 vai para outra mesa.
    const at2050 = slotsOf(getDayAvailability(data, '2026-09-15', 2, at('2026-09-15', '20:50'), 'admin'), 'dinner');
    expect(at2050.find((s) => s.time === '21:00')?.tableId).toBe('M02');
  });

  it('reserva concluída passa a considerar a preparação real', () => {
    const completed = makeReservation({
      tableId: 'M01',
      startAt: iso('2026-09-15', '19:00'),
      status: 'completed',
      seatedAt: iso('2026-09-15', '19:00'),
      completedAt: iso('2026-09-15', '20:10'),
    });
    const now = at('2026-09-15', '20:15');
    const busy = slotsOf(getDayAvailability(baseData({ reservations: [completed] }), '2026-09-15', 2, now, 'admin'), 'dinner');
    expect(busy.find((s) => s.time === '20:30')?.tableId).toBe('M01'); // preparação real terminou 20:30
    const extended = { ...completed, prepExtensionMinutes: 10 };
    const late = slotsOf(getDayAvailability(baseData({ reservations: [extended] }), '2026-09-15', 2, now, 'admin'), 'dinner');
    expect(late.find((s) => s.time === '20:30')?.tableId).toBe('M02');
  });

  it('mesas desativadas não recebem reservas', () => {
    const data = baseData();
    data.tables[0].active = false;
    expect(slotsOf(getDayAvailability(data, '2026-09-15', 2, NOW), 'dinner')[0].tableId).toBe('M02');
  });

  it('sugere as próximas datas com disponibilidade', () => {
    const data = baseData({
      blocks: ['M11', 'M12'].map((tableId) =>
        makeBlock({ tableId, startAt: iso('2026-09-15', '00:00'), endAt: iso('2026-09-17', '00:00') }),
      ),
    });
    expect(getDayAvailability(data, '2026-09-16', 6, NOW).totalSlots).toBe(0);
    const suggestions = findNextAvailableDates(data, '2026-09-16', 6, NOW, 3);
    expect(suggestions.map((s) => s.date)).toEqual(['2026-09-17', '2026-09-18', '2026-09-19']);
    expect(suggestions[0].firstSlot.time).toBe('12:00');
  });
});
