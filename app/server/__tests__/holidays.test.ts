import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseData } from '../../src/domain/__tests__/fixtures';
import { createHandler } from '../app';
import { createHolidaysService, NAGER_URL, parseYear } from '../holidays';
import { MemoryStateStore } from '../state';

const NAGER_2026 = [
  { date: '2026-01-01', localName: 'Jour de l’an', name: "New Year's Day", countryCode: 'FR', global: true, counties: null, types: ['Public'] },
  { date: '2026-04-03', localName: 'Vendredi saint', name: 'Good Friday', countryCode: 'FR', global: false, counties: ['FR-57'], types: ['Public'] },
  { date: '2026-07-14', localName: 'Fête nationale', name: 'Bastille Day', countryCode: 'FR', global: true, counties: null, types: ['Public'] },
  { date: '2026-11-01', localName: 'Toussaint', name: "All Saints' Day", countryCode: 'FR', global: true, counties: null, types: ['Public'] },
];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('feriados (Nager.Date) com fetch simulado', () => {
  it('consulta o ano, descarta feriados regionais e devolve só data e nomes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(NAGER_2026));
    const service = createHolidaysService({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await service.holidays(2026);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(NAGER_URL(2026));
    expect(result.available).toBe(true);
    expect(result.holidays).toEqual([
      { date: '2026-01-01', localName: 'Jour de l’an', name: "New Year's Day" },
      { date: '2026-07-14', localName: 'Fête nationale', name: 'Bastille Day' },
      { date: '2026-11-01', localName: 'Toussaint', name: "All Saints' Day" },
    ]);
  });

  it('guarda cada ano por 24 h', async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => jsonResponse(NAGER_2026));
    const service = createHolidaysService({ fetchImpl: fetchImpl as unknown as typeof fetch, clock: () => now });
    await service.holidays(2026);
    now = 23 * 3_600_000;
    await service.holidays(2026);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = 24 * 3_600_000 + 1;
    await service.holidays(2026);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falhas viram lista vazia com available = false (e não ficam em cache)', async () => {
    const failures = [
      async () => {
        throw new TypeError('fetch failed');
      },
      async () => jsonResponse({ message: 'erro' }, 500),
      async () => jsonResponse([{ date: 'amanhã', localName: 'x', name: 'y' }]),
      async () => new Response('<html>', { status: 200 }),
    ];
    for (const impl of failures) {
      const fetchImpl = vi.fn(impl);
      const service = createHolidaysService({ fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(await service.holidays(2026)).toEqual({ year: 2026, holidays: [], available: false });
      await service.holidays(2026);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  });

  it('desiste depois do tempo limite', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')));
        }),
    );
    const service = createHolidaysService({ fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 });
    expect(await service.holidays(2027)).toMatchObject({ available: false, holidays: [] });
  });

  it('valida o ano', async () => {
    expect(parseYear('2026')).toBe(2026);
    expect(parseYear('1999')).toBeNull();
    expect(parseYear('20x6')).toBeNull();
    expect(parseYear(null)).toBeNull();
    const service = createHolidaysService({ fetchImpl: vi.fn() as unknown as typeof fetch });
    expect(await service.handle('/api/admin/holidays?year=abc')).toMatchObject({ status: 400 });
  });
});

describe('rota /api/admin/holidays', () => {
  const servers: Server[] = [];
  afterEach(() => {
    servers.splice(0).forEach((server) => server.close());
  });

  it('exige sessão da administração', async () => {
    const server = createServer(
      createHandler({ store: new MemoryStateStore(baseData()), adminPassword: 'senha-muito-secreta', sessionSecret: 'x'.repeat(32) }),
    );
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/api/admin/holidays?year=2026`);
    expect(response.status).toBe(401);
  });
});
