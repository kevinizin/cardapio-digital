import { describe, expect, it } from 'vitest';
import { getOperationalAlerts } from '../alerts';
import { getDayAvailability } from '../availability';
import { validateBlock } from '../blocks';
import { validateCustomer } from '../customer';
import { createInitialData } from '../initial';
import { checkArrival, completeService, extendPrep, cancelByAdmin } from '../lifecycle';
import { computeDayOverview, computeOccupancy } from '../metrics';
import { getAreaLoad, loadProfile, peakLoad, segmentsForTable } from '../occupancy';
import { buildOnlineDraft, changeTable, createReservation, updateReservation, type ReservationDraft } from '../reservations';
import { restaurantSettings, restaurantTables } from '../restaurantSetup';
import { saveRules, saveTables } from '../settingsRules';
import type { DemoData, Table } from '../types';
import { at, baseData, customer, iso, makeBlock, makeReservation } from './fixtures';

const NOW = at('2026-09-15', '10:00');
const SALAO: Table = { id: 'SALAO', capacity: 10, area: 'salao', shared: true, active: true };
const TERRACO: Table = { id: 'TERRACO', capacity: 4, area: 'varanda', shared: true, active: true };

const areas = (overrides: Partial<DemoData> = {}) => baseData({ tables: [{ ...SALAO }, { ...TERRACO }], ...overrides });
const codes = (result: { ok: boolean; errors?: { code: string }[] }) => (result.ok ? [] : result.errors!.map((e) => e.code));

const adminDraft = (overrides: Partial<ReservationDraft> = {}): ReservationDraft => ({
  date: '2026-09-15',
  time: '19:00',
  partySize: 4,
  tableId: 'SALAO',
  serviceMinutes: 90,
  prepMinutes: 20,
  customer: { ...customer, email: '' },
  source: 'phone',
  ...overrides,
});

function book(data: DemoData, overrides: Partial<ReservationDraft> = {}, now = NOW) {
  const result = createReservation(data, adminDraft(overrides), now, { channel: 'admin' });
  if (!result.ok) throw new Error(`reserva recusada: ${codes(result).join(', ')}`);
  return result.value;
}

describe('áreas compartilhadas: lotação por pessoas', () => {
  it('reservas se sobrepõem enquanto a soma de pessoas cabe na capacidade', () => {
    let data = areas();
    data = book(data, { partySize: 4 }).data;
    data = book(data, { partySize: 4, time: '19:30' }).data;
    // 4 + 4 + 2 = 10 cabe; mais 1 pessoa não.
    data = book(data, { partySize: 2, time: '19:15' }).data;
    const full = createReservation(data, adminDraft({ partySize: 1, time: '19:45' }), NOW, { channel: 'admin' });
    expect(codes(full)).toEqual(['CONFLICT']);
    if (!full.ok) expect(full.errors[0].params).toMatchObject({ table: 'SALAO', area: 'salao' });
    // Depois que as primeiras saem (19:00 + 90 + 20 = 20:50), há lugar de novo.
    expect(book(data, { partySize: 4, time: '20:50' }).reservation.tableId).toBe('SALAO');
  });

  it('a preparação ocupa os lugares; o fim exato da preparação libera', () => {
    let data = areas({ tables: [{ ...SALAO, capacity: 4 }, { ...TERRACO, active: false }] });
    data = book(data, { partySize: 4 }).data; // 19:00–20:30 + prep até 20:50
    expect(codes(createReservation(data, adminDraft({ partySize: 1, time: '20:30' }), NOW, { channel: 'admin' }))).toEqual(['CONFLICT']);
    expect(createReservation(data, adminDraft({ partySize: 4, time: '20:50' }), NOW, { channel: 'admin' }).ok).toBe(true);
  });

  it('peakLoad soma pessoas por varredura e bloqueio conta a área cheia', () => {
    const data = areas({
      reservations: [
        makeReservation({ tableId: 'SALAO', startAt: iso('2026-09-15', '19:00'), partySize: 3 }),
        makeReservation({ tableId: 'SALAO', startAt: iso('2026-09-15', '20:00'), partySize: 5 }),
      ],
      blocks: [makeBlock({ tableId: 'SALAO', startAt: iso('2026-09-15', '22:00'), endAt: iso('2026-09-15', '23:00') })],
    });
    const segments = segmentsForTable(data, 'SALAO', NOW);
    expect(peakLoad(segments, { start: at('2026-09-15', '19:00'), end: at('2026-09-15', '19:59') }, 10)).toBe(3);
    expect(peakLoad(segments, { start: at('2026-09-15', '19:00'), end: at('2026-09-15', '21:00') }, 10)).toBe(8);
    expect(peakLoad(segments, { start: at('2026-09-15', '20:50'), end: at('2026-09-15', '21:50') }, 10)).toBe(5);
    expect(peakLoad(segments, { start: at('2026-09-15', '22:30'), end: at('2026-09-15', '22:45') }, 10)).toBe(10);
    const profile = loadProfile(segments, { start: at('2026-09-15', '19:00'), end: at('2026-09-15', '20:00') }, 10);
    expect(profile).toEqual([{ start: at('2026-09-15', '19:00'), end: at('2026-09-15', '20:00'), load: 3 }]);
  });

  it('bloqueio fecha a área inteira: nenhuma reserva no período e não cria bloqueio sobre reservas', () => {
    const blocked = areas({ blocks: [makeBlock({ tableId: 'SALAO', startAt: iso('2026-09-15', '18:30'), endAt: iso('2026-09-15', '20:00') })] });
    expect(codes(createReservation(blocked, adminDraft({ partySize: 1 }), NOW, { channel: 'admin' }))).toEqual(['CONFLICT']);

    const booked = book(areas(), { partySize: 1 }).data;
    const block = validateBlock(
      booked,
      { tableId: 'SALAO', startDate: '2026-09-15', startTime: '20:00', endDate: '2026-09-15', endTime: '21:00', reason: 'Evento privado' },
      NOW,
    );
    expect(codes(block)).toEqual(['CONFLICT']);
  });

  it('cliente presente além do horário continua ocupando lugares', () => {
    const now = at('2026-09-15', '20:50');
    const seated = makeReservation({
      tableId: 'SALAO',
      startAt: iso('2026-09-15', '19:00'),
      partySize: 8,
      status: 'seated',
      seatedAt: iso('2026-09-15', '19:00'),
    });
    const data = areas({ reservations: [seated] });
    // Pelo previsto a área liberaria às 20:50, mas o grupo segue lá: projeção até agora + preparação.
    const load = getAreaLoad(SALAO, data, now, now);
    expect(load.load).toBe(8);
    expect(load.seated.map((r) => r.id)).toEqual([seated.id]);
    expect(load.prep).toEqual([]);
    expect(codes(createReservation(data, adminDraft({ partySize: 3, time: '20:55' }), now, { channel: 'admin' }))).toEqual(['CONFLICT']);
    expect(createReservation(data, adminDraft({ partySize: 2, time: '20:55' }), now, { channel: 'admin' }).ok).toBe(true);
  });

  it('concluída usa a preparação real; cancelamento libera os lugares', () => {
    const now = at('2026-09-15', '20:00');
    const done = makeReservation({
      tableId: 'SALAO',
      startAt: iso('2026-09-15', '18:30'),
      partySize: 6,
      status: 'completed',
      seatedAt: iso('2026-09-15', '18:30'),
      completedAt: iso('2026-09-15', '19:50'),
      prepMinutes: 20,
    });
    const data = areas({ reservations: [done] });
    expect(getAreaLoad(SALAO, data, now, now).load).toBe(6); // em preparação até 20:10
    expect(getAreaLoad(SALAO, data, at('2026-09-15', '20:10'), now).load).toBe(0);

    let booked = book(areas(), { partySize: 10 }).data;
    expect(codes(createReservation(booked, adminDraft({ partySize: 2 }), NOW, { channel: 'admin' }))).toEqual(['CONFLICT']);
    const id = booked.reservations[0].id;
    const cancelled = cancelByAdmin(booked, id, 'Cliente desistiu', NOW);
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) booked = cancelled.value.data;
    expect(createReservation(booked, adminDraft({ partySize: 10 }), NOW, { channel: 'admin' }).ok).toBe(true);
  });

  it('aumentar o grupo na edição revalida a lotação', () => {
    let data = book(areas(), { partySize: 6 }).data;
    const second = book(data, { partySize: 4, time: '19:30' });
    data = second.data;
    const grown = updateReservation(data, second.reservation.id, { ...adminDraft({ partySize: 5, time: '19:30' }) }, NOW);
    expect(codes(grown)).toEqual(['CONFLICT']);
    const same = updateReservation(data, second.reservation.id, { ...adminDraft({ partySize: 4, time: '19:30' }), customer: { ...customer, email: '', notes: 'Janela' } }, NOW);
    expect(same.ok).toBe(true);
  });

  it('grupos maiores que 8 pela administração cabem numa área grande; online segue o limite', () => {
    const data = createInitialData(NOW);
    expect(data.settings.rules.onlineMaxPartySize).toBe(8);
    const tuesday = { ...adminDraft({ partySize: 20, tableId: 'auto', time: '12:00', prepMinutes: 10 }), date: '2026-09-15' };
    const big = createReservation(data, tuesday, NOW, { channel: 'admin' });
    expect(big.ok && big.value.reservation.tableId).toBe('SALAO');
    expect(codes(createReservation(data, { ...tuesday, partySize: 31 }, NOW, { channel: 'admin' }))).toEqual(['PARTY_ABOVE_CAPACITY']);
    const online = createReservation(
      data,
      buildOnlineDraft(data, { date: '2026-09-15', time: '12:00', partySize: 9, customer: { ...customer, phone: '+33 6 00 00 00 00' } }),
      NOW,
      { channel: 'online' },
    );
    expect(codes(online)).toEqual(['PARTY_ABOVE_ONLINE_LIMIT']);
  });

  it('escolha automática: salão primeiro, terraço quando o salão lota', () => {
    let data = areas();
    data = book(data, { partySize: 8, tableId: 'auto' }).data;
    expect(data.reservations[0].tableId).toBe('SALAO');
    const second = book(data, { partySize: 4, tableId: 'auto', time: '19:15' });
    expect(second.reservation.tableId).toBe('TERRACO');
    data = second.data;
    expect(book(data, { partySize: 2, tableId: 'auto', time: '19:15' }).reservation.tableId).toBe('SALAO');
    // Online: horários contam os lugares das duas áreas.
    const day = getDayAvailability(data, '2026-09-15', 4, NOW, 'online');
    const slot1915 = day.shifts.flatMap((s) => s.slots).find((s) => s.time === '19:15');
    expect(slot1915).toBeUndefined();
    const slot1200 = day.shifts.flatMap((s) => s.slots).find((s) => s.time === '12:00');
    expect(slot1200?.tableId).toBe('SALAO');
  });

  it('mesas comuns continuam preferidas (menor que comporta) antes das áreas', () => {
    const data = baseData({ tables: [{ ...SALAO }, { id: 'M01', capacity: 2, area: 'salao', active: true }] });
    expect(book(data, { partySize: 2, tableId: 'auto' }).reservation.tableId).toBe('M01');
    expect(book(data, { partySize: 3, tableId: 'auto' }).reservation.tableId).toBe('SALAO');
  });

  it('mudar de área verifica os lugares da área de destino', () => {
    let data = book(areas(), { partySize: 4, tableId: 'TERRACO' }).data;
    const moving = book(data, { partySize: 3, tableId: 'SALAO' });
    data = moving.data;
    expect(codes(changeTable(data, moving.reservation.id, 'TERRACO', NOW))).toEqual(['CONFLICT']);
    const small = book(data, { partySize: 3, tableId: 'SALAO', time: '12:00' });
    expect(changeTable(small.data, small.reservation.id, 'TERRACO', NOW).ok).toBe(true);
  });

  it('chegada antecipada exige lugares livres desde agora', () => {
    const now = at('2026-09-15', '18:30');
    const present = makeReservation({ tableId: 'TERRACO', startAt: iso('2026-09-15', '18:00'), partySize: 3, status: 'seated', seatedAt: iso('2026-09-15', '18:00') });
    // Reserva das 20:00: o grupo presente (3) sai às 19:30 + preparação; às 18:30 só cabe 1 pessoa a mais.
    const early2 = makeReservation({ tableId: 'TERRACO', startAt: iso('2026-09-15', '20:00'), partySize: 2 });
    const blocked = checkArrival(areas({ reservations: [present, early2] }), early2, now);
    expect(codes(blocked)).toEqual(['TABLE_BUSY_NOW']);
    if (!blocked.ok) expect(blocked.errors[0].params).toMatchObject({ area: 'varanda' });
    const early1 = makeReservation({ tableId: 'TERRACO', startAt: iso('2026-09-15', '20:00'), partySize: 1 });
    expect(checkArrival(areas({ reservations: [present, early1] }), early1, now).ok).toBe(true);
  });

  it('concluir e estender preparação respeitam a lotação', () => {
    const now = at('2026-09-15', '20:20');
    const seated = makeReservation({ tableId: 'TERRACO', startAt: iso('2026-09-15', '18:50'), partySize: 2, status: 'seated', seatedAt: iso('2026-09-15', '18:50') });
    const next = makeReservation({ tableId: 'TERRACO', startAt: iso('2026-09-15', '20:30'), partySize: 2 });
    const data = areas({ reservations: [seated, next] });
    const done = completeService(data, seated.id, now);
    expect(done.ok && done.warnings).toEqual([]); // 2 em preparação + 2 chegando = 4, cabe
    if (!done.ok) return;
    const another = makeReservation({ tableId: 'TERRACO', startAt: iso('2026-09-15', '20:45'), partySize: 2 });
    const withMore = { ...done.value.data, reservations: [...done.value.data.reservations, another] };
    expect(codes(extendPrep(withMore, seated.id, 10, 'Limpeza demorada', now))).toEqual(['CONFLICT']);
    expect(extendPrep(done.value.data, seated.id, 10, 'Limpeza demorada', now).ok).toBe(true);
  });
});

describe('configurações de áreas compartilhadas', () => {
  const future = (time: string, partySize: number) => makeReservation({ tableId: 'SALAO', startAt: iso('2026-09-16', time), partySize });

  it('reduzir a capacidade abaixo do pico previsto é recusado; acima do pico é aceito', () => {
    const r1 = future('19:00', 6);
    const r2 = future('19:30', 3);
    const data = areas({ reservations: [r1, r2] });
    const change = (capacity: number) => [{ id: 'SALAO', capacity, active: true }, { id: 'TERRACO', capacity: 4, active: true }];
    const refused = saveTables(data, change(8), NOW);
    expect(codes(refused)).toEqual(['TABLE_CHANGE_CONFLICTS']);
    if (!refused.ok) expect(new Set(refused.errors[0].reservationIds)).toEqual(new Set([r1.id, r2.id]));
    expect(saveTables(data, change(9), NOW).ok).toBe(true);
  });

  it('capacidade de área vai até 200; mesa comum continua limitada a 12', () => {
    const data = baseData({ tables: [{ ...SALAO }, { id: 'M01', capacity: 2, area: 'salao', active: true }] });
    expect(saveTables(data, [{ id: 'SALAO', capacity: 150, active: true }], NOW).ok).toBe(true);
    expect(codes(saveTables(data, [{ id: 'SALAO', capacity: 201, active: true }], NOW))).toEqual(['CAPACITY_INVALID']);
    expect(codes(saveTables(data, [{ id: 'M01', capacity: 20, active: true }], NOW))).toEqual(['CAPACITY_INVALID']);
  });
});

describe('alertas e métricas das áreas', () => {
  it('alerta quando a lotação projetada passa da capacidade por causa de clientes além do horário', () => {
    const now = at('2026-09-15', '20:40');
    const overdue = makeReservation({ tableId: 'TERRACO', startAt: iso('2026-09-15', '19:00'), partySize: 3, status: 'seated', seatedAt: iso('2026-09-15', '19:00') });
    const next = makeReservation({ tableId: 'TERRACO', startAt: iso('2026-09-15', '20:50'), partySize: 2 });
    const data = areas({ reservations: [overdue, next] });
    const alert = getOperationalAlerts(data, now).find((a) => a.kind === 'area_over_capacity');
    expect(alert).toMatchObject({ severity: 'critical', tableId: 'TERRACO', people: 5, capacity: 4, nextReservationId: next.id });
    // Com folga, nenhum alerta de área.
    const relaxed = areas({ reservations: [overdue, { ...next, partySize: 1 }] });
    expect(getOperationalAlerts(relaxed, now).some((a) => a.kind === 'area_over_capacity')).toBe(false);
  });

  it('ocupação planejada usa pessoas × minutos ÷ capacidade × minutos abertos', () => {
    // Um único dia aberto no mês não é possível com a grade padrão; usa o mês e compara proporções.
    const r = makeReservation({ tableId: 'SALAO', startAt: iso('2026-09-15', '19:00'), partySize: 5, serviceMinutes: 90 });
    const data = areas({ tables: [{ ...SALAO }], reservations: [r] });
    const { planned } = computeOccupancy(data, '2026-09', NOW);
    expect(planned.numeratorMinutes).toBe(5 * 90);
    expect(planned.ratio).toBeGreaterThan(0);
    const bigger = computeOccupancy({ ...data, reservations: [{ ...r, partySize: 10 }] }, '2026-09', NOW).planned;
    expect(bigger.numeratorMinutes).toBe(2 * planned.numeratorMinutes);
    expect(bigger.denominatorMinutes).toBe(planned.denominatorMinutes);
  });

  it('visão do dia mostra lugares livres agora nas áreas', () => {
    const now = at('2026-09-15', '19:30');
    const seated = makeReservation({ tableId: 'SALAO', startAt: iso('2026-09-15', '19:00'), partySize: 6, status: 'seated', seatedAt: iso('2026-09-15', '19:00') });
    const waiting = makeReservation({ tableId: 'TERRACO', startAt: iso('2026-09-15', '19:15'), partySize: 2 });
    const day = computeDayOverview(areas({ reservations: [seated, waiting] }), '2026-09-15', now);
    expect(day.seats).toEqual({ total: 14, freeNow: 14 - 6 - 2 });
    expect(day.activeTables).toBe(0);
  });
});

describe('configuração inicial do restaurante', () => {
  it('salão 30 e terraço 10 por lugares, preparação de 10 min e fechamentos de fim de ano', () => {
    expect(restaurantTables()).toEqual([
      { id: 'SALAO', capacity: 30, area: 'salao', shared: true, active: true },
      { id: 'TERRACO', capacity: 10, area: 'varanda', shared: true, active: true },
    ]);
    const settings = restaurantSettings('2026-09-25');
    expect(settings.rules).toMatchObject({ serviceMinutes: 90, prepMinutes: 10, onlineMaxPartySize: 8, phoneRequired: true });
    expect(settings.exceptions.map((e) => [e.date, e.closed, e.note])).toEqual([
      ['2026-12-25', true, 'Natal'],
      ['2027-01-01', true, 'Ano-novo'],
    ]);
    expect(settings.exceptions.every((e) => /^exc_/.test(e.id))).toBe(true);
  });

  it('última reserva do dia é 20:15 (1h30 + 10 min até as 22h)', () => {
    const data = createInitialData(NOW);
    const slots = getDayAvailability(data, '2026-09-15', 2, NOW, 'online').shifts.flatMap((s) => s.slots);
    expect(slots.at(-1)?.time).toBe('20:15');
  });
});

describe('telefone obrigatório online', () => {
  it('online exige telefone quando a regra está ligada; a administração não', () => {
    const data = createInitialData(NOW);
    const noPhone = buildOnlineDraft(data, { date: '2026-09-15', time: '19:00', partySize: 2, customer });
    expect(codes(createReservation(data, noPhone, NOW, { channel: 'online' }))).toEqual(['PHONE_REQUIRED']);
    const withPhone = { ...noPhone, customer: { ...customer, phone: '+33 6 12 34 56 78' } };
    expect(createReservation(data, withPhone, NOW, { channel: 'online' }).ok).toBe(true);
    expect(createReservation(data, adminDraft({ tableId: 'auto', prepMinutes: 10 }), NOW, { channel: 'admin' }).ok).toBe(true);
  });

  it('sem a regra (dados antigos), o telefone continua opcional', () => {
    const data = baseData();
    expect(data.settings.rules.phoneRequired).toBeUndefined();
    expect(createReservation(data, buildOnlineDraft(data, { date: '2026-09-15', time: '19:00', partySize: 2, customer }), NOW, { channel: 'online' }).ok).toBe(true);
    expect(validateCustomer(customer, { emailRequired: true, phoneRequired: true }).map((e) => e.code)).toEqual(['PHONE_REQUIRED']);
  });

  it('a regra pode ser ligada e desligada em Configurações', () => {
    const data = baseData();
    const on = saveRules(data, { ...data.settings.rules, phoneRequired: true });
    expect(on.ok && on.value.data.settings.rules.phoneRequired).toBe(true);
  });
});
