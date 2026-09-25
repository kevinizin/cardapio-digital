import { describe, expect, it } from 'vitest';
import { getDayAvailability } from '../availability';
import { plannedBlockEnd } from '../occupancy';
import { buildOnlineDraft, changeTable, createReservation, updateReservation, type ReservationDraft } from '../reservations';
import { parisTime } from '../time';
import { at, baseData, customer, iso, makeReservation } from './fixtures';

const NOW = at('2026-09-15', '10:00');

const onlineDraft = (data: ReturnType<typeof baseData>, date: string, time: string, partySize = 2) =>
  buildOnlineDraft(data, { date, time, partySize, customer });

const adminDraft = (overrides: Partial<ReservationDraft> = {}): ReservationDraft => ({
  date: '2026-09-15',
  time: '19:00',
  partySize: 4,
  tableId: 'M05',
  serviceMinutes: 90,
  prepMinutes: 20,
  customer: { ...customer, email: '' },
  source: 'phone',
  ...overrides,
});

const codes = (result: { ok: boolean; errors?: { code: string }[] }) => (result.ok ? [] : result.errors!.map((e) => e.code));

describe('criação de reservas', () => {
  it('cliente reserva online: mesa automática, código aleatório e durações aplicadas', () => {
    const data = baseData();
    const result = createReservation(data, onlineDraft(data, '2026-09-15', '19:00'), NOW, { channel: 'online' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { reservation } = result.value;
    expect(reservation.tableId).toBe('M01');
    expect(reservation.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(reservation.status).toBe('confirmed');
    expect([reservation.serviceMinutes, reservation.prepMinutes]).toEqual([90, 20]);
    expect(reservation.history[0]).toMatchObject({ kind: 'created', actor: 'customer' });
    expect(result.value.data.reservations).toHaveLength(1);
  });

  it('revalida com dados recentes: horário esgotado devolve SLOT_UNAVAILABLE', () => {
    let data = baseData();
    for (let i = 0; i < 12; i += 1) {
      const result = createReservation(data, onlineDraft(data, '2026-09-15', '19:00'), NOW, { channel: 'online' });
      expect(result.ok).toBe(true);
      if (result.ok) data = result.value.data;
    }
    const last = createReservation(data, onlineDraft(data, '2026-09-15', '19:00'), NOW, { channel: 'online' });
    expect(codes(last)).toEqual(['SLOT_UNAVAILABLE']);
  });

  it('rejeita passado, antecedência, fora da grade, fim de turno, dia fechado e janela', () => {
    const data = baseData();
    const tryOnline = (date: string, time: string, now = NOW) =>
      codes(createReservation(data, onlineDraft(data, date, time), now, { channel: 'online' }));
    expect(tryOnline('2026-09-15', '09:00')).toEqual(['START_IN_PAST']);
    expect(tryOnline('2026-09-15', '19:00', at('2026-09-15', '18:45'))).toEqual(['MIN_ADVANCE']);
    expect(tryOnline('2026-09-15', '19:05')).toEqual(['OFF_GRID']);
    expect(tryOnline('2026-09-15', '21:15')).toEqual(['OUTSIDE_SHIFT']);
    expect(tryOnline('2026-09-21', '19:00')).toEqual(['DAY_CLOSED']);
    expect(tryOnline('2026-11-15', '19:00')).toEqual(['BEYOND_WINDOW']);
  });

  it('valida dados do cliente e limite de pessoas online', () => {
    const data = baseData();
    const bad = buildOnlineDraft(data, {
      date: '2026-09-15',
      time: '19:00',
      partySize: 7,
      customer: { name: '', email: 'sem-arroba', phone: 'abc', notes: 'x'.repeat(301) },
    });
    expect(codes(createReservation(data, bad, NOW, { channel: 'online' })).sort()).toEqual(
      ['EMAIL_INVALID', 'NAME_REQUIRED', 'NOTES_TOO_LONG', 'PARTY_ABOVE_ONLINE_LIMIT', 'PHONE_INVALID'].sort(),
    );
  });

  it('administração: duração inválida, capacidade excedida e mesa inexistente', () => {
    const data = baseData();
    const admin = (draft: ReservationDraft) => codes(createReservation(data, draft, NOW, { channel: 'admin' }));
    expect(admin(adminDraft({ serviceMinutes: 25 }))).toEqual(['SERVICE_DURATION_INVALID']);
    expect(admin(adminDraft({ serviceMinutes: 92 }))).toEqual(['SERVICE_DURATION_INVALID']);
    expect(admin(adminDraft({ prepMinutes: 125 }))).toEqual(['PREP_DURATION_INVALID']);
    expect(admin(adminDraft({ partySize: 4, tableId: 'M01' }))).toEqual(['TABLE_TOO_SMALL']);
    expect(admin(adminDraft({ partySize: 9, tableId: 'auto' }))).toEqual(['PARTY_ABOVE_CAPACITY']);
    expect(admin(adminDraft({ tableId: 'M99' }))).toEqual(['TABLE_NOT_FOUND']);
    // Administração não exige antecedência mínima, mas não aceita reservas no passado.
    expect(admin(adminDraft({ time: '19:00' }))).toEqual([]);
    expect(createReservation(data, adminDraft({ time: '19:10' }), at('2026-09-15', '19:05'), { channel: 'admin' }).ok).toBe(true);
    expect(codes(createReservation(data, adminDraft({ time: '19:00' }), at('2026-09-15', '19:05'), { channel: 'admin' }))).toEqual([
      'START_IN_PAST',
    ]);
  });
});

describe('edição e troca de mesa', () => {
  it('a própria reserva é excluída da busca de conflitos', () => {
    const created = createReservation(baseData(), adminDraft(), NOW, { channel: 'admin' });
    if (!created.ok) throw new Error('falha ao criar');
    const { data, reservation } = created.value;
    const moved = updateReservation(data, reservation.id, adminDraft({ time: '19:15' }), NOW);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(parisTime(Date.parse(moved.value.reservation.startAt))).toBe('19:15');
    expect(moved.value.reservation.history.at(-1)).toMatchObject({
      kind: 'updated',
      actor: 'admin',
      changes: [{ field: 'time', from: '19:00', to: '19:15' }],
    });
  });

  it('rejeita edição que conflita com outra reserva e informa o conflito', () => {
    const other = makeReservation({ tableId: 'M06', startAt: iso('2026-09-15', '21:00'), partySize: 4 });
    const created = createReservation(baseData({ reservations: [other] }), adminDraft(), NOW, { channel: 'admin' });
    if (!created.ok) throw new Error('falha ao criar');
    const result = updateReservation(created.value.data, created.value.reservation.id, adminDraft({ tableId: 'M06', time: '19:30' }), NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe('CONFLICT');
    expect(result.errors[0].conflicts?.[0]).toMatchObject({ kind: 'reservation', id: other.id, segment: 'service' });
  });

  it('mudança de configuração não altera reservas existentes', () => {
    const created = createReservation(baseData(), adminDraft(), NOW, { channel: 'admin' });
    if (!created.ok) throw new Error('falha ao criar');
    const data = created.value.data;
    data.settings.rules.serviceMinutes = 120;
    const reservation = data.reservations[0];
    expect(reservation.serviceMinutes).toBe(90);
    expect(parisTime(plannedBlockEnd(reservation))).toBe('20:50');
    const dinner = getDayAvailability(data, '2026-09-16', 2, NOW).shifts.find((s) => s.shift.kind === 'dinner');
    expect(dinner?.slots.at(-1)?.time).toBe('20:30'); // 20:30 + 2h + 20 min = 22:50
  });

  it('não edita reservas concluídas, canceladas ou com ausência', () => {
    const done = makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '12:00'), status: 'completed' });
    const result = updateReservation(baseData({ reservations: [done] }), done.id, adminDraft({ tableId: 'M01', partySize: 2 }), NOW);
    expect(codes(result)).toEqual(['NOT_EDITABLE']);
  });

  it('trocar mesa de cliente presente valida a ocupação a partir de agora', () => {
    const seated = makeReservation({
      tableId: 'M05',
      startAt: iso('2026-09-15', '19:00'),
      status: 'seated',
      seatedAt: iso('2026-09-15', '19:00'),
    });
    const upcoming = makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '20:00') });
    const data = baseData({ reservations: [seated, upcoming] });
    const now = at('2026-09-15', '19:30');
    expect(codes(changeTable(data, seated.id, 'M01', now))).toEqual(['CONFLICT']);
    const ok = changeTable(data, seated.id, 'M02', now);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.reservation.history.at(-1)?.kind).toBe('table_changed');
  });
});
