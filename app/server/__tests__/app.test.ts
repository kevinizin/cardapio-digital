import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { at, baseData } from '../../src/domain/__tests__/fixtures';
import type { DemoData, Reservation } from '../../src/domain/types';
import { createHandler } from '../app';
import { MemoryStateStore } from '../state';

const NOW = at('2026-09-15', '12:00');
const PASSWORD = 'senha-muito-secreta';
const SECRET = 'x'.repeat(32);
const servers: Server[] = [];

async function start(initial: DemoData = baseData()) {
  const store = new MemoryStateStore(initial);
  const server = createServer(createHandler({ store, adminPassword: PASSWORD, sessionSecret: SECRET, clock: () => NOW }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { store, base, post };
}

afterEach(() => {
  servers.splice(0).forEach((server) => server.close());
});

const booking = {
  date: '2026-09-16',
  time: '20:00',
  partySize: 2,
  customer: { name: 'Ana Teste', email: 'ana@example.com', phone: '+33 6 00 00 00 00', notes: 'Aniversário' },
};

async function login(base: string, password = PASSWORD) {
  const response = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return { status: response.status, cookie: (response.headers.get('set-cookie') ?? '').split(';')[0] };
}

describe('API pública', () => {
  it('cria a reserva e devolve dados públicos sem informações pessoais', async () => {
    const { post, store } = await start();
    const response = await post('/api/public/reservations', booking);
    const body = (await response.json()) as { ok: boolean; reservation: Reservation; data: DemoData };

    expect(response.status).toBe(200);
    expect(body.reservation.customer.name).toBe('Ana Teste');
    expect(body.data.revision).toBe(2);
    expect(JSON.stringify(body.data)).not.toMatch(/Ana|ana@example|Aniversário|\+33/);
    expect(body.data.reservations[0].code).toBe('-');
    expect((await store.load()).reservations[0].customer.email).toBe('ana@example.com');
  });

  it('recusa reserva fora das regras com os códigos de erro (422)', async () => {
    const { post } = await start();
    const response = await post('/api/public/reservations', { ...booking, date: '2026-09-14' });
    const body = (await response.json()) as { ok: boolean; errors: { code: string }[] };
    expect(response.status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('não reserva a mesma mesa duas vezes: o último pedido recebe a próxima mesa ou é recusado', async () => {
    const { post, store } = await start();
    const results = await Promise.all(Array.from({ length: 14 }, () => post('/api/public/reservations', booking)));
    const created = results.filter((r) => r.status === 200).length;
    const data = await store.load();
    const tables = data.reservations.map((r) => r.tableId);
    expect(new Set(tables).size).toBe(tables.length);
    expect(created).toBe(data.reservations.length);
    expect(results.some((r) => r.status === 422)).toBe(true);
  });

  it('consulta e cancela só com código + e-mail corretos', async () => {
    const { post } = await start();
    const created = (await (await post('/api/public/reservations', booking)).json()) as { reservation: Reservation };
    const code = created.reservation.code;

    const wrong = await (await post('/api/public/lookup', { code, email: 'outra@example.com' })).json();
    expect(wrong).toEqual({ reservation: null });
    const right = (await (await post('/api/public/lookup', { code: code.toLowerCase(), email: 'ANA@example.com' })).json()) as {
      reservation: Reservation;
    };
    expect(right.reservation.id).toBe(created.reservation.id);

    const denied = await post('/api/public/cancel', { code, email: 'outra@example.com' });
    expect(denied.status).toBe(422);
    const cancelled = (await (await post('/api/public/cancel', { code, email: 'ana@example.com' })).json()) as {
      reservation: Reservation;
    };
    expect(cancelled.reservation.status).toBe('cancelled');
  });

  it('recusa escrita vinda de outro site e corpo que não é JSON', async () => {
    const { post, base } = await start();
    expect((await post('/api/public/reservations', booking, { Origin: 'https://outro-site.example' })).status).toBe(403);
    const text = await fetch(`${base}/api/public/reservations`, { method: 'POST', body: 'a=1' });
    expect(text.status).toBe(415);
  });
});

describe('API da administração', () => {
  it('exige login e recusa senha errada', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/admin/data`)).status).toBe(401);
    expect((await login(base, 'errada')).status).toBe(401);
    const { status, cookie } = await login(base);
    expect(status).toBe(200);
    const data = await fetch(`${base}/api/admin/data`, { headers: { Cookie: cookie } });
    expect(data.status).toBe(200);
  });

  it('limita tentativas de login', async () => {
    const { base } = await start();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await login(base, 'errada')).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('salva com a revisão certa e devolve conflito com a versão atual', async () => {
    const { base } = await start();
    const { cookie } = await login(base);
    const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const current = (await (await fetch(`${base}/api/admin/data`, { headers })).json()) as DemoData;
    const next = { ...current, revision: current.revision + 1 };

    const saved = await fetch(`${base}/api/admin/data`, { method: 'PUT', headers, body: JSON.stringify({ baseRevision: current.revision, data: next }) });
    expect(await saved.json()).toEqual({ ok: true, revision: next.revision });

    const stale = await fetch(`${base}/api/admin/data`, { method: 'PUT', headers, body: JSON.stringify({ baseRevision: current.revision, data: next }) });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { data: DemoData }).data.revision).toBe(next.revision);

    const invalid = await fetch(`${base}/api/admin/data`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ baseRevision: next.revision, data: { nada: true } }),
    });
    expect(invalid.status).toBe(400);
  });
});

describe('API pública com área controlada por lugares', () => {
  const shared = () =>
    baseData({ tables: [{ id: 'SALAO', capacity: 10, area: 'salao', shared: true, active: true }] });
  const party = (partySize: number) => ({ ...booking, partySize });

  it('soma as pessoas no mesmo horário: 4 + 4 cabem, mais 4 é recusado (422), mais 2 cabe', async () => {
    const { post, store } = await start(shared());
    expect((await post('/api/public/reservations', party(4))).status).toBe(200);
    expect((await post('/api/public/reservations', party(4))).status).toBe(200);
    const full = await post('/api/public/reservations', party(4));
    expect(full.status).toBe(422);
    const body = (await full.json()) as { errors: { code: string }[] };
    expect(body.errors.map((e) => e.code)).toEqual(['SLOT_UNAVAILABLE']);
    expect((await post('/api/public/reservations', party(2))).status).toBe(200);
    const data = await store.load();
    expect(data.reservations.map((r) => r.tableId)).toEqual(['SALAO', 'SALAO', 'SALAO']);
    expect(data.reservations.reduce((sum, r) => sum + r.partySize, 0)).toBe(10);
  });

  it('pedidos simultâneos nunca passam da capacidade', async () => {
    const { post, store } = await start(shared());
    const results = await Promise.all(Array.from({ length: 8 }, () => post('/api/public/reservations', party(3))));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    const data = await store.load();
    expect(data.reservations.reduce((sum, r) => sum + r.partySize, 0)).toBe(9);
  });

  it('com telefone obrigatório, o servidor recusa reserva online sem telefone', async () => {
    const data = shared();
    data.settings.rules = { ...data.settings.rules, phoneRequired: true };
    const { post } = await start(data);
    const response = await post('/api/public/reservations', { ...booking, customer: { ...booking.customer, phone: '' } });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { errors: { code: string }[] };
    expect(body.errors.map((e) => e.code)).toEqual(['PHONE_REQUIRED']);
    expect((await post('/api/public/reservations', booking)).status).toBe(200);
  });
});
