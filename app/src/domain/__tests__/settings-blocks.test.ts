import { describe, expect, it } from 'vitest';
import { createBlock, releaseBlock, type BlockDraft } from '../blocks';
import { defaultWeekly } from '../defaults';
import { weeklyRulesForDate } from '../schedule';
import { saveException, saveRules, saveTables, saveWeeklySchedule, validateDayRule } from '../settingsRules';
import type { DateException } from '../types';
import { at, baseData, iso, makeBlock, makeReservation } from './fixtures';

const NOW = at('2026-09-15', '10:00');
const codes = (result: { ok: boolean; errors?: { code: string }[] }) => (result.ok ? [] : result.errors!.map((e) => e.code));

describe('mesas: capacidade e ativação sem invalidar reservas futuras', () => {
  const future = makeReservation({ tableId: 'M05', startAt: iso('2026-09-20', '19:00'), partySize: 4 });
  const tables = (overrides: Record<string, { capacity?: number; active?: boolean }>) =>
    baseData().tables.map((t) => ({ id: t.id, capacity: overrides[t.id]?.capacity ?? t.capacity, active: overrides[t.id]?.active ?? t.active }));

  it('impede reduzir capacidade abaixo do grupo reservado', () => {
    const result = saveTables(baseData({ reservations: [future] }), tables({ M05: { capacity: 2 } }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatchObject({ code: 'TABLE_CHANGE_CONFLICTS', reservationIds: [future.id] });
  });

  it('impede desativar mesa com reserva futura e registra ativações válidas', () => {
    expect(codes(saveTables(baseData({ reservations: [future] }), tables({ M05: { active: false } }), NOW))).toEqual(['TABLE_CHANGE_CONFLICTS']);
    const ok = saveTables(baseData({ reservations: [future] }), tables({ M06: { active: false } }), NOW);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.data.tableEvents).toEqual([{ tableId: 'M06', active: false, at: new Date(NOW).toISOString() }]);
  });

  it('limite online não pode superar a maior mesa ativa', () => {
    expect(codes(saveTables(baseData(), tables({ M11: { active: false }, M12: { active: false } }), NOW))).toEqual([
      'ONLINE_LIMIT_ABOVE_CAPACITY',
    ]);
    expect(codes(saveTables(baseData(), tables({ M01: { capacity: 0 } }), NOW))).toEqual(['CAPACITY_INVALID']);
  });
});

describe('funcionamento, exceções e regras', () => {
  const tuesdayDinner = makeReservation({ tableId: 'M01', startAt: iso('2026-09-22', '19:00') });

  it('valida horários dos turnos', () => {
    const inverted = { lunch: { enabled: true, start: '15:00', end: '12:00' }, dinner: { enabled: false, start: '19:00', end: '23:00' } };
    expect(validateDayRule(inverted, 'd').map((e) => e.code)).toEqual(['SHIFT_ORDER_INVALID']);
    const overlapping = { lunch: { enabled: true, start: '12:00', end: '19:30' }, dinner: { enabled: true, start: '19:00', end: '23:00' } };
    expect(validateDayRule(overlapping, 'd').map((e) => e.code)).toEqual(['SHIFTS_OVERLAP']);
  });

  it('fechar um dia com reservas futuras exige resolver os conflitos antes', () => {
    const weekly = defaultWeekly();
    weekly[1].dinner.enabled = false; // terça sem jantar
    const blocked = saveWeeklySchedule(baseData({ reservations: [tuesdayDinner] }), weekly, NOW);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.errors[0]).toMatchObject({ code: 'SCHEDULE_CONFLICTS', reservationIds: [tuesdayDinner.id] });

    const saved = saveWeeklySchedule(baseData(), weekly, NOW);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    // A nova grade vale a partir de hoje; o histórico continua com a grade anterior.
    expect(weeklyRulesForDate(saved.value.data.settings, '2026-09-01')[1].dinner.enabled).toBe(true);
    expect(weeklyRulesForDate(saved.value.data.settings, '2026-09-22')[1].dinner.enabled).toBe(false);
  });

  it('exceções: data passada, duplicada ou com reservas é rejeitada', () => {
    const exception = (date: string, id = 'exc1'): DateException => ({
      id,
      date,
      closed: true,
      lunch: { enabled: true, start: '12:00', end: '15:00' },
      dinner: { enabled: true, start: '19:00', end: '23:00' },
      note: 'Fechado',
    });
    expect(codes(saveException(baseData({ reservations: [tuesdayDinner] }), exception('2026-09-22'), NOW))).toEqual(['SCHEDULE_CONFLICTS']);
    expect(codes(saveException(baseData(), exception('2026-09-10'), NOW))).toEqual(['EXCEPTION_DATE_PAST']);
    const first = saveException(baseData(), exception('2026-09-23'), NOW);
    if (!first.ok) throw new Error('falha');
    expect(codes(saveException(first.value.data, exception('2026-09-23', 'exc2'), NOW))).toEqual(['EXCEPTION_DUPLICATE']);
  });

  it('regras fora dos limites são rejeitadas', () => {
    const data = baseData();
    expect(codes(saveRules(data, { ...data.settings.rules, serviceMinutes: 20 }))).toEqual(['RULE_OUT_OF_RANGE']);
    expect(codes(saveRules(data, { ...data.settings.rules, slotIntervalMinutes: 7 }))).toEqual(['RULE_OUT_OF_RANGE']);
    expect(codes(saveRules(data, { ...data.settings.rules, onlineMaxPartySize: 8 }))).toEqual(['ONLINE_LIMIT_ABOVE_CAPACITY']);
    expect(saveRules(data, { ...data.settings.rules, prepMinutes: 30 }).ok).toBe(true);
  });
});

describe('bloqueios manuais', () => {
  const draft = (overrides: Partial<BlockDraft> = {}): BlockDraft => ({
    tableId: 'M01',
    startDate: '2026-09-15',
    startTime: '19:00',
    endDate: '2026-09-15',
    endTime: '23:00',
    reason: 'Manutenção',
    ...overrides,
  });
  const reservation = makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '19:00') });

  it('rejeita conflito com reservas existentes e aceita período adjacente', () => {
    const data = baseData({ reservations: [reservation] });
    const conflict = createBlock(data, draft(), NOW);
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.errors[0].conflicts?.[0].id).toBe(reservation.id);
    expect(createBlock(data, draft({ startTime: '20:50' }), NOW).ok).toBe(true);
  });

  it('valida período, passado e motivo', () => {
    const data = baseData();
    expect(codes(createBlock(data, draft({ endTime: '19:00' }), NOW))).toEqual(['BLOCK_RANGE_INVALID']);
    expect(codes(createBlock(data, draft({ startTime: '08:00' }), NOW))).toEqual(['BLOCK_IN_PAST']);
    expect(codes(createBlock(data, draft({ reason: '' }), NOW))).toEqual(['REASON_REQUIRED']);
  });

  it('remove futuro, encerra em andamento e preserva os já terminados', () => {
    const futureBlock = makeBlock({ tableId: 'M02', startAt: iso('2026-09-15', '19:00'), endAt: iso('2026-09-15', '20:00') });
    const ongoing = makeBlock({ tableId: 'M03', startAt: iso('2026-09-15', '09:00'), endAt: iso('2026-09-15', '11:00') });
    const past = makeBlock({ tableId: 'M04', startAt: iso('2026-09-15', '08:00'), endAt: iso('2026-09-15', '09:00') });
    const data = baseData({ blocks: [futureBlock, ongoing, past] });
    const removed = releaseBlock(data, futureBlock.id, NOW);
    expect(removed.ok && removed.value.outcome).toBe('removed');
    const ended = releaseBlock(data, ongoing.id, NOW);
    expect(ended.ok && ended.value.data.blocks.find((b) => b.id === ongoing.id)?.endAt).toBe(new Date(NOW).toISOString());
    expect(codes(releaseBlock(data, past.id, NOW))).toEqual(['BLOCK_ALREADY_ENDED']);
  });
});
