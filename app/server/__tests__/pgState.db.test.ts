import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createReservation, buildOnlineDraft } from '../../src/domain/reservations';
import { at } from '../../src/domain/__tests__/fixtures';
import { PgStateStore } from '../state';

/**
 * Testes contra um Postgres de verdade (banco descartável!):
 *   TEST_DATABASE_URL=postgres://... npm run test:db
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Defina TEST_DATABASE_URL com um banco descartável para rodar estes testes.');

const NOW = at('2026-09-15', '12:00');
const store = new PgStateStore(url, { clock: () => NOW });

beforeAll(async () => {
  const pg = await import('pg');
  const client = new pg.default.Client({ connectionString: url });
  await client.connect();
  await client.query('drop table if exists app_state, app_state_history');
  await client.end();
  await store.migrate();
});

afterAll(() => store.close());

const input = {
  date: '2026-09-16',
  time: '20:00',
  partySize: 2,
  customer: { name: 'Ana Teste', email: 'ana@example.com', phone: '', notes: '' },
};

describe('PgStateStore', () => {
  it('cria o documento inicial uma única vez', async () => {
    await store.migrate();
    const data = await store.load();
    expect(data.revision).toBe(1);
    expect(data.reservations).toEqual([]);
  });

  it('gravações simultâneas são serializadas: nenhuma mesa reservada duas vezes', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 20 }, () =>
        store.update((data) => {
          const result = createReservation(data, buildOnlineDraft(data, input), NOW, { channel: 'online' });
          return result.ok
            ? { data: { ...result.value.data, revision: data.revision + 1 }, result: true }
            : { data: null, result: false };
        }),
      ),
    );
    const data = await store.load();
    const tables = data.reservations.map((r) => r.tableId);
    expect(new Set(tables).size).toBe(tables.length);
    expect(attempts.filter(Boolean).length).toBe(data.reservations.length);
    expect(data.revision).toBe(1 + data.reservations.length);
  });

  it('substituição com revisão antiga devolve a versão atual', async () => {
    const current = await store.load();
    const next = { ...current, revision: current.revision + 1 };
    expect(await store.replace(current.revision, next)).toEqual({ ok: true });
    const stale = await store.replace(current.revision, next);
    expect(stale.ok).toBe(false);
  });
});

describe('PgStateStore — configuração inicial', () => {
  it('atualiza o documento nunca alterado e preserva o que já foi usado', async () => {
    const pg = await import('pg');
    const client = new pg.default.Client({ connectionString: url });
    await client.connect();
    await client.query('drop table if exists app_state, app_state_history');
    await store.migrate();
    // Simula um documento antigo, nunca alterado, com outra configuração de mesas.
    await client.query(`update app_state set data = jsonb_set(data, '{tables}', '[]'::jsonb) where id = 1`);
    await store.migrate();
    expect((await store.load()).tables.length).toBeGreaterThan(0);

    const used = { ...(await store.load()), revision: 2, tables: [] };
    await store.replace(1, used);
    await store.migrate();
    expect((await store.load()).tables).toEqual([]);
    await client.end();
  });
});
