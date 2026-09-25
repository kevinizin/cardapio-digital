import { describe, expect, it } from 'vitest';
import { getOperationalAlerts } from '../alerts';
import { getDayAvailability } from '../availability';
import {
  cancelByAdmin,
  cancelByCustomer,
  completeService,
  endPrepEarly,
  extendPrep,
  markNoShow,
  registerArrival,
} from '../lifecycle';
import { getLiveTableStatus, prepEndMs } from '../occupancy';
import { buildOnlineDraft, createReservation } from '../reservations';
import { parisTime } from '../time';
import type { DemoData } from '../types';
import { at, baseData, customer, iso, makeBlock, makeReservation } from './fixtures';

const codes = (result: { ok: boolean; errors?: { code: string }[] }) => (result.ok ? [] : result.errors!.map((e) => e.code));
const t = (time: string) => at('2026-09-15', time);

function unwrap<T>(result: { ok: true; value: T } | { ok: false; errors: { code: string }[] }): T {
  if (!result.ok) throw new Error(result.errors.map((e) => e.code).join(', '));
  return result.value;
}

describe('fluxo completo: reserva → chegada → conclusão → preparação → liberação', () => {
  it('libera a mesa somente depois da preparação', () => {
    let data: DemoData = baseData();
    const created = unwrap(
      createReservation(data, buildOnlineDraft(data, { date: '2026-09-15', time: '19:00', partySize: 2, customer }), t('10:00'), {
        channel: 'online',
      }),
    );
    data = created.data;
    const id = created.reservation.id;
    const table = data.tables.find((tb) => tb.id === created.reservation.tableId)!;

    expect(getLiveTableStatus(table, data, t('18:30')).state).toBe('reserved');
    data = unwrap(registerArrival(data, id, t('19:02'))).data;
    expect(getLiveTableStatus(table, data, t('19:30')).state).toBe('occupied');

    data = unwrap(completeService(data, id, t('20:25'))).data;
    expect(getLiveTableStatus(table, data, t('20:30')).state).toBe('prep');
    expect(getLiveTableStatus(table, data, t('20:45')).state).toBe('free');

    const kinds = data.reservations[0].history.map((h) => h.kind);
    expect(kinds).toEqual(['created', 'arrived', 'completed']);
    const dinner = getDayAvailability(data, '2026-09-15', 2, t('20:46'), 'admin').shifts.find((s) => s.shift.kind === 'dinner');
    expect(dinner?.slots.find((s) => s.time === '21:00')?.tableId).toBe('M01');
  });
});

describe('chegada', () => {
  const base = () => {
    const first = makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '19:00'), status: 'seated', seatedAt: iso('2026-09-15', '19:00') });
    const next = makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '21:00') });
    return { first, next, data: baseData({ reservations: [first, next] }) };
  };

  it('chegada antecipada exige mesa livre naquele momento', () => {
    const { first, next, data } = base();
    expect(codes(registerArrival(data, next.id, t('20:40')))).toEqual(['TABLE_BUSY_NOW']);
    const completed = unwrap(completeService(data, first.id, t('20:35'))).data;
    expect(codes(registerArrival(completed, next.id, t('20:40')))).toEqual(['TABLE_BUSY_NOW']); // em preparação até 20:55
    const released = unwrap(endPrepEarly(completed, first.id, t('20:38'))).data;
    const arrived = registerArrival(released, next.id, t('20:40'));
    expect(arrived.ok).toBe(true);
    if (arrived.ok) expect(arrived.warnings.map((w) => w.code)).toEqual(['EARLY_ARRIVAL']);
  });

  it('limites de chegada e aviso de atraso', () => {
    const r = makeReservation({ tableId: 'M02', startAt: iso('2026-09-15', '19:00') });
    const data = baseData({ reservations: [r] });
    expect(codes(registerArrival(data, r.id, t('15:30')))).toEqual(['ARRIVAL_TOO_EARLY']);
    expect(codes(registerArrival(data, r.id, t('20:31')))).toEqual(['ARRIVAL_WINDOW_ENDED']);
    const late = registerArrival(data, r.id, t('19:20'));
    expect(late.ok && late.warnings.map((w) => w.code)).toEqual(['LATE_ARRIVAL']);
  });
});

describe('conclusão e preparação', () => {
  it('concluir usa a preparação salva na reserva e avisa sobre a próxima reserva', () => {
    const seated = makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '19:00'), status: 'seated', seatedAt: iso('2026-09-15', '19:00'), prepMinutes: 25 });
    const next = makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '21:00') });
    const data = baseData({ reservations: [seated, next] });
    data.settings.rules.prepMinutes = 20;

    const onTime = unwrap(completeService(data, seated.id, t('20:20')));
    expect(parisTime(prepEndMs(onTime.reservation)!)).toBe('20:45');

    const late = completeService(data, seated.id, t('20:50'));
    expect(late.ok && late.warnings.map((w) => [w.code, w.reservationIds])).toEqual([['PREP_OVERLAPS_NEXT', [next.id]]]);
  });

  it('encerrar preparação antes e estender com motivo, validando reservas futuras', () => {
    const done = makeReservation({
      tableId: 'M01',
      startAt: iso('2026-09-15', '19:00'),
      status: 'completed',
      seatedAt: iso('2026-09-15', '19:00'),
      completedAt: iso('2026-09-15', '20:30'),
    });
    const next = makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '21:00') });
    const data = baseData({ reservations: [done, next] });
    expect(codes(extendPrep(data, done.id, 10, '', t('20:35')))).toEqual(['REASON_REQUIRED']);
    expect(codes(extendPrep(data, done.id, 7, 'Limpeza extra', t('20:35')))).toEqual(['EXTENSION_INVALID']);
    expect(codes(extendPrep(data, done.id, 15, 'Limpeza extra', t('20:35')))).toEqual(['CONFLICT']);
    const extended = unwrap(extendPrep(data, done.id, 10, 'Limpeza extra', t('20:35')));
    expect(parisTime(prepEndMs(extended.reservation)!)).toBe('21:00'); // adjacente à próxima reserva
    expect(extended.reservation.history.at(-1)).toMatchObject({ kind: 'prep_extended', minutes: 10, reason: 'Limpeza extra' });

    const ended = unwrap(endPrepEarly(data, done.id, t('20:40')));
    expect(ended.reservation.prepEndedAt).toBe(iso('2026-09-15', '20:40'));
    expect(codes(endPrepEarly(ended.data, done.id, t('20:41')))).toEqual(['PREP_NOT_ACTIVE']);
  });
});

describe('cancelamento e ausência', () => {
  const r = makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '19:00') });

  it('cliente cancela até 2 horas antes; depois precisa procurar o restaurante', () => {
    const data = baseData({ reservations: [r] });
    expect(cancelByCustomer(data, r.id, t('17:00')).ok).toBe(true);
    expect(codes(cancelByCustomer(data, r.id, t('17:01')))).toEqual(['CANCEL_DEADLINE_PASSED']);
  });

  it('cancelada não pode ser cancelada novamente e libera o horário', () => {
    const cancelled = unwrap(cancelByCustomer(baseData({ reservations: [r] }), r.id, t('12:00'))).data;
    expect(codes(cancelByCustomer(cancelled, r.id, t('12:05')))).toEqual(['ALREADY_CANCELLED']);
    expect(codes(cancelByAdmin(cancelled, r.id, 'Motivo qualquer', t('12:05')))).toEqual(['ALREADY_CANCELLED']);
    const dinner = getDayAvailability(cancelled, '2026-09-15', 2, t('12:06')).shifts.find((s) => s.shift.kind === 'dinner');
    expect(dinner?.slots[0].tableId).toBe('M01');
  });

  it('administração cancela com justificativa', () => {
    const data = baseData({ reservations: [r] });
    expect(codes(cancelByAdmin(data, r.id, ' ', t('18:00')))).toEqual(['REASON_REQUIRED']);
    const result = unwrap(cancelByAdmin(data, r.id, 'Cliente ligou para cancelar', t('18:00')));
    expect(result.reservation).toMatchObject({ status: 'cancelled', cancelledBy: 'admin', cancelReason: 'Cliente ligou para cancelar' });
  });

  it('ausência só após início + tolerância', () => {
    const data = baseData({ reservations: [r] });
    expect(codes(markNoShow(data, r.id, t('19:14')))).toEqual(['NO_SHOW_TOO_EARLY']);
    const marked = unwrap(markNoShow(data, r.id, t('19:15')));
    expect(marked.reservation.status).toBe('no_show');
    expect(codes(registerArrival(marked.data, r.id, t('19:20')))).toEqual(['STATUS_NOT_ALLOWED']);
  });
});

describe('estado das mesas e alertas', () => {
  it('distingue livre, reservada, ocupada, em preparação, bloqueada e desativada', () => {
    const data = baseData({
      reservations: [
        makeReservation({ tableId: 'M05', startAt: iso('2026-09-15', '19:00'), status: 'seated', seatedAt: iso('2026-09-15', '19:00') }),
        makeReservation({ tableId: 'M06', startAt: iso('2026-09-15', '19:00'), status: 'completed', seatedAt: iso('2026-09-15', '19:00'), completedAt: iso('2026-09-15', '19:20') }),
        makeReservation({ tableId: 'M08', startAt: iso('2026-09-15', '20:15') }),
      ],
      blocks: [makeBlock({ tableId: 'M07', startAt: iso('2026-09-15', '19:00'), endAt: iso('2026-09-15', '21:00') })],
    });
    data.tables.find((tb) => tb.id === 'M10')!.active = false;
    const state = (id: string) => getLiveTableStatus(data.tables.find((tb) => tb.id === id)!, data, t('19:30')).state;
    expect(['M05', 'M06', 'M07', 'M08', 'M09', 'M10'].map(state)).toEqual(['occupied', 'prep', 'blocked', 'reserved', 'free', 'inactive']);
  });

  it('alerta atraso, tolerância excedida, atendimento além do previsto e risco para a próxima reserva', () => {
    const late = makeReservation({ tableId: 'M02', startAt: iso('2026-09-15', '20:30') });
    const seated = makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '19:00'), status: 'seated', seatedAt: iso('2026-09-15', '19:00') });
    const next = makeReservation({ tableId: 'M01', startAt: iso('2026-09-15', '21:00') });
    const pending = makeReservation({ tableId: 'M03', startAt: iso('2026-09-13', '19:00') });
    const data = baseData({ reservations: [late, seated, next, pending] });

    const at2035 = getOperationalAlerts(data, t('20:35'));
    expect(at2035.find((a) => a.reservationId === late.id)?.kind).toBe('late_arrival');
    expect(at2035.find((a) => a.kind === 'next_at_risk')).toMatchObject({ severity: 'warning', nextReservationId: next.id });
    expect(at2035.find((a) => a.kind === 'overstay')?.reservationId).toBe(seated.id);
    expect(at2035.find((a) => a.kind === 'pending_update')?.reservationIds).toEqual([pending.id]);

    const at2050 = getOperationalAlerts(data, t('20:50'));
    expect(at2050.find((a) => a.reservationId === late.id)?.kind).toBe('tolerance_exceeded');
    expect(at2050.find((a) => a.kind === 'next_at_risk')?.severity).toBe('critical');
    // Alertas não alteram dados: nada foi deslocado ou concluído.
    expect(data.reservations.map((r) => r.status)).toEqual(['confirmed', 'seated', 'confirmed', 'confirmed']);
  });
});
