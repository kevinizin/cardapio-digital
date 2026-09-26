import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createReservation, buildOnlineDraft } from '../../src/domain/reservations';
import { at } from '../../src/domain/__tests__/fixtures';
import { MAX_ATTEMPTS, PgEmailLog } from '../email/log';
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
    expect(await store.replace(current.revision, next)).toEqual({ ok: true, previous: current });
    const stale = await store.replace(current.revision, next);
    expect(stale.ok).toBe(false);
  });
});

describe('PgEmailLog', () => {
  const log = new PgEmailLog(store.pool);
  const job = (key: string, reservationId = 'res_1') => ({ kind: 'confirm' as const, reservationId, key });

  beforeAll(async () => {
    await store.pool.query('drop table if exists email_log');
    await log.migrate();
    await log.migrate(); // idempotente
  });

  it('a chave única impede duplicar o mesmo e-mail', async () => {
    expect(await log.enqueue(job('confirm:res_1'), NOW)).toBe(true);
    expect(await log.enqueue(job('confirm:res_1'), NOW)).toBe(false);
    const due = await log.due(NOW, 10);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ reservationId: 'res_1', kind: 'confirm', key: 'confirm:res_1', status: 'pending', attempts: 0 });
  });

  it('falha agenda nova tentativa; enviado sai da fila; limite de tentativas', async () => {
    const [entry] = await log.due(NOW, 10);
    await log.markFailed(entry.id, 'x'.repeat(900), NOW + 60_000);
    expect(await log.due(NOW, 10)).toHaveLength(0);
    const [retry] = await log.due(NOW + 60_000, 10);
    expect(retry).toMatchObject({ status: 'failed', attempts: 1 });
    expect(retry.lastError).toHaveLength(500);
    await log.markSent(retry.id, NOW + 61_000);
    expect(await log.due(NOW + 3_600_000, 10)).toHaveLength(0);
    const [sent] = await log.listByReservation('res_1');
    expect(sent).toMatchObject({ status: 'sent', attempts: 2, lastError: null, sentAt: new Date(NOW + 61_000).toISOString() });

    await log.enqueue(job('confirm:res_2', 'res_2'), NOW);
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const [pending] = await log.due(NOW + i * 60_000, 10);
      await log.markFailed(pending.id, 'erro', NOW + (i + 1) * 60_000);
    }
    expect(await log.due(NOW + 3_600_000, 10)).toHaveLength(0);

    await log.enqueue(job('confirm:res_3', 'res_3'), NOW);
    const [third] = await log.due(NOW, 10);
    await log.markSkipped(third.id, 'obsoleto');
    expect((await log.listByReservation('res_3'))[0]).toMatchObject({ status: 'skipped', lastError: 'obsoleto' });
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
