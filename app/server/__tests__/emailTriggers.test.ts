import { describe, expect, it } from 'vitest';
import { at, baseData, iso, makeReservation } from '../../src/domain/__tests__/fixtures';
import type { Reservation } from '../../src/domain/types';
import { MemoryEmailLog } from '../email/log';
import { diffEmailJobs, isJobStillValid, jobFor, reminderAtMs, reminderJobs } from '../email/triggers';

const NOW = at('2026-09-15', '12:00');

function confirmed(partial: Partial<Reservation> = {}): Reservation {
  return makeReservation({ tableId: 'SALAO', startAt: iso('2026-09-16', '20:00'), createdAt: iso('2026-09-01', '12:00'), ...partial });
}

const data = (reservations: Reservation[]) => baseData({ reservations });

describe('e-mails a partir da gravação da administração (diferença)', () => {
  it('reserva nova confirmada com e-mail → confirmação; sem e-mail ou no passado → nada', () => {
    const withEmail = confirmed();
    const noEmail = confirmed({ customer: { name: 'Sem Email', email: '', phone: '', notes: '' } });
    const past = confirmed({ startAt: iso('2026-09-14', '20:00') });
    const jobs = diffEmailJobs(data([]), data([withEmail, noEmail, past]), NOW);
    expect(jobs).toEqual([{ kind: 'confirm', reservationId: withEmail.id, key: `confirm:${withEmail.id}` }]);
  });

  it('confirmada → cancelada gera cancelamento', () => {
    const r = confirmed();
    const cancelled = { ...r, status: 'cancelled' as const, cancelledBy: 'admin' as const, cancelReason: 'motivo' };
    expect(diffEmailJobs(data([r]), data([cancelled]), NOW)).toEqual([{ kind: 'cancel', reservationId: r.id, key: `cancel:${r.id}` }]);
  });

  it('mudança de horário ou de pessoas gera alteração com chave própria', () => {
    const r = confirmed();
    const moved = { ...r, startAt: iso('2026-09-16', '21:00') };
    const bigger = { ...r, partySize: 5 };
    expect(diffEmailJobs(data([r]), data([moved]), NOW)).toEqual([
      { kind: 'change', reservationId: r.id, key: `change:${r.id}:${moved.startAt}:2` },
    ]);
    expect(diffEmailJobs(data([r]), data([bigger]), NOW)[0].key).toBe(`change:${r.id}:${r.startAt}:5`);
  });

  it('mudanças que não interessam ao cliente não geram e-mail', () => {
    const r = confirmed();
    const tableChanged = { ...r, tableId: 'TERRACO' };
    const notes = { ...r, customer: { ...r.customer, notes: 'nova observação' } };
    const seated = { ...r, status: 'seated' as const };
    expect(diffEmailJobs(data([r]), data([tableChanged]), NOW)).toEqual([]);
    expect(diffEmailJobs(data([r]), data([notes]), NOW)).toEqual([]);
    expect(diffEmailJobs(data([r]), data([seated]), NOW)).toEqual([]);
    expect(diffEmailJobs(data([r]), data([r]), NOW)).toEqual([]);
  });

  it('e-mail informado depois numa reserva sem e-mail → confirmação', () => {
    const r = confirmed({ source: 'phone', customer: { name: 'Tel', email: '', phone: '0600000000', notes: '' } });
    const withEmail = { ...r, customer: { ...r.customer, email: 'tel@example.com' } };
    expect(diffEmailJobs(data([r]), data([withEmail]), NOW)).toEqual([jobFor('confirm', withEmail)]);
  });

  it('a chave impede enviar o mesmo e-mail duas vezes', async () => {
    const log = new MemoryEmailLog();
    const r = confirmed();
    expect(await log.enqueue(jobFor('confirm', r), NOW)).toBe(true);
    expect(await log.enqueue(jobFor('confirm', r), NOW)).toBe(false);
    const moved = { ...r, startAt: iso('2026-09-16', '21:00') };
    expect(await log.enqueue(jobFor('change', moved), NOW)).toBe(true);
    expect(await log.enqueue(jobFor('change', moved), NOW)).toBe(false);
    expect(await log.enqueue(jobFor('change', { ...moved, startAt: iso('2026-09-16', '21:15') }), NOW)).toBe(true);
    expect(log.entries).toHaveLength(3);
  });
});

describe('lembrete do dia anterior (10:00 de Paris)', () => {
  it('só a partir das 10:00 da véspera', () => {
    const r = confirmed();
    expect(reminderJobs(data([r]), at('2026-09-15', '09:59'))).toEqual([]);
    expect(reminderJobs(data([r]), at('2026-09-15', '10:00'))).toEqual([jobFor('reminder', r)]);
    expect(jobFor('reminder', r).key).toBe(`reminder:${r.id}:2026-09-16`);
    expect(reminderJobs(data([r]), at('2026-09-15', '23:59'))).toHaveLength(1);
  });

  it('no próprio dia da reserva não envia (servidor fora do ar na véspera)', () => {
    expect(reminderJobs(data([confirmed()]), at('2026-09-16', '08:00'))).toEqual([]);
  });

  it('reserva feita depois das 10:00 da véspera (ou para o mesmo dia) não recebe lembrete', () => {
    const late = confirmed({ createdAt: iso('2026-09-15', '10:30') });
    const early = confirmed({ createdAt: iso('2026-09-15', '09:30') });
    const sameDay = confirmed({ startAt: iso('2026-09-15', '20:00'), createdAt: iso('2026-09-15', '08:00') });
    const jobs = reminderJobs(data([late, early, sameDay]), at('2026-09-15', '11:00'));
    expect(jobs.map((j) => j.reservationId)).toEqual([early.id]);
  });

  it('reserva transferida para amanhã depois das 10:00 não recebe (já recebeu a alteração)', () => {
    const moved = confirmed({
      history: [
        { at: iso('2026-09-15', '10:45'), kind: 'updated', actor: 'admin', changes: [{ field: 'date', from: '2026-09-20', to: '2026-09-16' }] },
      ],
    });
    const notesOnly = confirmed({
      history: [{ at: iso('2026-09-15', '10:45'), kind: 'updated', actor: 'admin', changes: [{ field: 'notes', from: '', to: 'x' }] }],
    });
    const jobs = reminderJobs(data([moved, notesOnly]), at('2026-09-15', '11:00'));
    expect(jobs.map((j) => j.reservationId)).toEqual([notesOnly.id]);
  });

  it('canceladas, sem e-mail ou de outros dias ficam de fora', () => {
    const now = at('2026-09-15', '11:00');
    const list = [
      confirmed({ status: 'cancelled' }),
      confirmed({ customer: { name: 'X', email: '', phone: '', notes: '' } }),
      confirmed({ startAt: iso('2026-09-17', '20:00') }),
    ];
    expect(reminderJobs(data(list), now)).toEqual([]);
  });

  it('horário de verão: 10:00 de Paris vale 08:00 UTC no verão e 09:00 UTC no inverno', () => {
    // Fim do horário de verão em 25/10/2026: a véspera (24/10) ainda é UTC+2.
    const onDstEnd = confirmed({ startAt: iso('2026-10-25', '12:00'), createdAt: iso('2026-10-01', '12:00') });
    expect(new Date(reminderAtMs(onDstEnd)).toISOString()).toBe('2026-10-24T08:00:00.000Z');
    // Dia seguinte à mudança: a véspera (25/10) já é UTC+1.
    const afterDstEnd = confirmed({ startAt: iso('2026-10-27', '12:00'), createdAt: iso('2026-10-01', '12:00') });
    expect(new Date(reminderAtMs(afterDstEnd)).toISOString()).toBe('2026-10-26T09:00:00.000Z');
    // Início do horário de verão em 29/03/2026: a véspera (28/03) ainda é UTC+1.
    const onDstStart = confirmed({ startAt: iso('2026-03-29', '12:00'), createdAt: iso('2026-03-01', '12:00') });
    expect(new Date(reminderAtMs(onDstStart)).toISOString()).toBe('2026-03-28T09:00:00.000Z');
    // Reserva numa segunda-feira depois da mudança (véspera = domingo 29/03, já UTC+2).
    const afterDstStart = confirmed({ startAt: iso('2026-03-30', '12:00'), createdAt: iso('2026-03-01', '12:00') });
    expect(new Date(reminderAtMs(afterDstStart)).toISOString()).toBe('2026-03-29T08:00:00.000Z');
    expect(reminderJobs(data([afterDstStart]), Date.parse('2026-03-29T07:59:00Z'))).toEqual([]);
    expect(reminderJobs(data([afterDstStart]), Date.parse('2026-03-29T08:00:00Z'))).toHaveLength(1);
  });
});

describe('conferência na hora do envio', () => {
  it('descarta tarefas que não valem mais', () => {
    const r = confirmed();
    const moved = { ...r, startAt: iso('2026-09-16', '21:00') };
    const oldChange = jobFor('change', { ...r, startAt: iso('2026-09-16', '20:30') });
    expect(isJobStillValid(jobFor('confirm', r), r, NOW)).toBe(true);
    expect(isJobStillValid(oldChange, moved, NOW)).toBe(false);
    expect(isJobStillValid(jobFor('change', moved), moved, NOW)).toBe(true);
    expect(isJobStillValid(jobFor('confirm', r), { ...r, status: 'cancelled' }, NOW)).toBe(false);
    expect(isJobStillValid(jobFor('cancel', r), { ...r, status: 'cancelled' }, NOW)).toBe(true);
    expect(isJobStillValid(jobFor('confirm', r), r, at('2026-09-16', '20:01'))).toBe(false);
    expect(isJobStillValid(jobFor('confirm', r), undefined, NOW)).toBe(false);
    expect(isJobStillValid(jobFor('reminder', r), r, at('2026-09-16', '09:00'))).toBe(false);
  });
});
