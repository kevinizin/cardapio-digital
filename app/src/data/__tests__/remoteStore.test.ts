import { describe, expect, it, vi } from 'vitest';
import { cancelByAdmin, registerArrival } from '../../domain/lifecycle';
import type { DomainError } from '../../domain/errors';
import type { DemoData } from '../../domain/types';
import { at, baseData, iso, makeReservation } from '../../domain/__tests__/fixtures';
import { ApiFailure, type Api, type SaveResponse } from '../api';
import { RemoteStore } from '../remoteStore';

const NOW = at('2026-09-15', '20:10');
const clock = () => NOW;

/** Servidor falso: guarda o documento e aceita gravações com a revisão certa. */
function fakeServer(initial: DemoData) {
  const server = { data: initial, failNext: 0, saves: 0 };
  const api = {
    adminData: async () => server.data,
    saveAdminData: async (baseRevision: number, data: DemoData): Promise<SaveResponse> => {
      if (server.failNext > 0) {
        server.failNext -= 1;
        throw new ApiFailure(0, 'rede');
      }
      server.saves += 1;
      if (baseRevision !== server.data.revision) return { ok: false, conflict: true, data: server.data };
      server.data = data;
      return { ok: true, revision: data.revision };
    },
  } as unknown as Api;
  return { server, api };
}

const reservation = makeReservation({ startAt: iso('2026-09-15', '20:00'), tableId: 'M01' });

function adminStore(api: Api, data: DemoData) {
  return new RemoteStore(data, { audience: 'admin', api, clock, pollMs: 0, retryMs: () => 0 });
}

describe('RemoteStore (administração)', () => {
  it('aplica o comando na hora e salva no servidor com a revisão de base', async () => {
    const initial = baseData({ reservations: [reservation] });
    const { server, api } = fakeServer(initial);
    const store = adminStore(api, initial);

    const result = store.execute((data, nowMs) => registerArrival(data, reservation.id, nowMs));
    expect(result.ok).toBe(true);
    expect(store.getSnapshot().data.reservations[0].status).toBe('seated');
    expect(store.getSnapshot().persistence).toMatchObject({ mode: 'remote', sync: 'saving' });

    await store.settle();
    expect(server.data.revision).toBe(2);
    expect(server.data.reservations[0].status).toBe('seated');
    expect(store.getSnapshot().persistence).toMatchObject({ sync: 'saved' });
  });

  it('em conflito, refaz o comando sobre a versão nova do servidor', async () => {
    const other = makeReservation({ startAt: iso('2026-09-15', '21:00'), tableId: 'M02' });
    const initial = baseData({ reservations: [reservation, other] });
    const { server, api } = fakeServer(initial);
    const store = adminStore(api, initial);
    // Outra pessoa cancelou a segunda reserva enquanto esta tela estava aberta.
    const cancelled = cancelByAdmin(initial, other.id, 'Pedido por telefone', NOW);
    if (!cancelled.ok) throw new Error('falha no preparo');
    server.data = { ...cancelled.value.data, revision: 2 };

    store.execute((data, nowMs) => registerArrival(data, reservation.id, nowMs));
    await store.settle();

    expect(server.data.revision).toBe(3);
    expect(server.data.reservations.map((r) => r.status)).toEqual(['seated', 'cancelled']);
    expect(store.getSnapshot().data).toEqual(server.data);
  });

  it('descarta e avisa o comando que deixou de valer depois do conflito', async () => {
    const initial = baseData({ reservations: [reservation] });
    const { server, api } = fakeServer(initial);
    const store = adminStore(api, initial);
    const cancelled = cancelByAdmin(initial, reservation.id, 'Cliente desistiu', NOW);
    if (!cancelled.ok) throw new Error('falha no preparo');
    server.data = { ...cancelled.value.data, revision: 2 };
    const rejected = vi.fn<(errors: DomainError[]) => void>();
    store.onRejected(rejected);

    store.execute((data, nowMs) => registerArrival(data, reservation.id, nowMs));
    await store.settle();

    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected.mock.calls[0][0][0].code).toBe('SAVE_REJECTED');
    expect(server.data.revision).toBe(2);
    expect(store.getSnapshot().data.reservations[0].status).toBe('cancelled');
  });

  it('sem conexão, fica pendente e tenta de novo até salvar', async () => {
    const initial = baseData({ reservations: [reservation] });
    const { server, api } = fakeServer(initial);
    server.failNext = 2;
    const store = adminStore(api, initial);
    const states: string[] = [];
    store.subscribe(() => {
      const p = store.getSnapshot().persistence;
      if (p.mode === 'remote') states.push(p.sync);
    });

    store.execute((data, nowMs) => registerArrival(data, reservation.id, nowMs));
    await store.settle();

    expect(states).toContain('offline');
    expect(states.at(-1)).toBe('saved');
    expect(server.data.reservations[0].status).toBe('seated');
  });

  it('vários comandos seguidos são salvos em ordem, sem perder nenhum', async () => {
    const other = makeReservation({ startAt: iso('2026-09-15', '20:00'), tableId: 'M02' });
    const initial = baseData({ reservations: [reservation, other] });
    const { server, api } = fakeServer(initial);
    const store = adminStore(api, initial);

    store.execute((data, nowMs) => registerArrival(data, reservation.id, nowMs));
    store.execute((data, nowMs) => registerArrival(data, other.id, nowMs));
    await store.settle();

    expect(server.data.reservations.map((r) => r.status)).toEqual(['seated', 'seated']);
    expect(server.data.revision).toBe(3);
  });
});

describe('RemoteStore (site do cliente)', () => {
  it('não executa comandos da administração', () => {
    const store = new RemoteStore(baseData(), { audience: 'public', pollMs: 0, clock });
    const result = store.execute((data, nowMs) => registerArrival(data, 'x', nowMs));
    expect(result.ok).toBe(false);
  });

  it('junta a reserva criada (com dados completos) à versão pública', async () => {
    const hidden = { ...reservation, code: '-', customer: { name: '', email: '', phone: '', notes: '' } };
    const created = makeReservation({ startAt: iso('2026-09-16', '20:00'), tableId: 'M03' });
    const publicData = baseData({ revision: 2, reservations: [hidden, { ...created, code: '-' }] });
    const api = {
      createOnline: async () => ({ ok: true, reservation: created, data: publicData }),
    } as unknown as Api;
    const store = new RemoteStore(baseData(), { audience: 'public', api, pollMs: 0, clock });

    const result = await store.createOnline({ date: '2026-09-16', time: '20:00', partySize: 2, customer: created.customer });

    expect(result.ok).toBe(true);
    const found = store.getSnapshot().data.reservations.find((r) => r.id === created.id);
    expect(found?.code).toBe(created.code);
    expect(store.getSnapshot().data.reservations).toHaveLength(2);
  });

  it('traduz falha de rede em erro legível', async () => {
    const api = {
      createOnline: async () => {
        throw new ApiFailure(0, 'rede');
      },
    } as unknown as Api;
    const store = new RemoteStore(baseData(), { audience: 'public', api, pollMs: 0, clock });
    const result = await store.createOnline({ date: '2026-09-16', time: '20:00', partySize: 2, customer: reservation.customer });
    expect(result).toEqual({ ok: false, errors: [{ code: 'NETWORK_ERROR' }] });
  });
});
