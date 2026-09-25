import pg from 'pg';
import { createInitialData } from '../src/domain/initial';
import type { DemoData } from '../src/domain/types';

/**
 * Onde o documento do restaurante mora. Um único registro JSON com revisão:
 * toda gravação confere a revisão (controle otimista) e guarda uma cópia no
 * histórico, para recuperar qualquer versão anterior em caso de engano.
 */
export interface StateStore {
  load(): Promise<DemoData>;
  /** Executa `fn` com o documento travado; grava se `fn` devolver dados novos. */
  update<T>(fn: (data: DemoData) => { data: DemoData | null; result: T }): Promise<T>;
  /** Substitui o documento se a revisão atual for `baseRevision`. */
  replace(baseRevision: number, data: DemoData): Promise<{ ok: true } | { ok: false; current: DemoData }>;
  close(): Promise<void>;
}

export class MemoryStateStore implements StateStore {
  private data: DemoData;
  private queue: Promise<unknown> = Promise.resolve();
  readonly history: DemoData[] = [];

  constructor(initial: DemoData) {
    this.data = initial;
  }

  async load() {
    return this.data;
  }

  update<T>(fn: (data: DemoData) => { data: DemoData | null; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { data, result } = fn(this.data);
      if (data) this.save(data);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async replace(baseRevision: number, data: DemoData) {
    if (this.data.revision !== baseRevision) return { ok: false as const, current: this.data };
    this.save(data);
    return { ok: true as const };
  }

  private save(data: DemoData) {
    this.data = data;
    this.history.push(data);
  }

  async close() {}
}

export class PgStateStore implements StateStore {
  private readonly pool: pg.Pool;
  private readonly clock: () => number;

  constructor(connectionString: string, options: { ssl?: boolean; clock?: () => number } = {}) {
    this.pool = new pg.Pool({
      connectionString,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
    this.clock = options.clock ?? Date.now;
  }

  /** Cria as tabelas e o documento inicial, se ainda não existirem. */
  async migrate(): Promise<void> {
    await this.pool.query(`
      create table if not exists app_state (
        id integer primary key check (id = 1),
        revision integer not null,
        data jsonb not null,
        updated_at timestamptz not null default now()
      );
      create table if not exists app_state_history (
        id bigserial primary key,
        revision integer not null,
        data jsonb not null,
        saved_at timestamptz not null default now()
      );
    `);
    const initial = createInitialData(this.clock());
    await this.pool.query(
      'insert into app_state (id, revision, data) values (1, $1, $2) on conflict (id) do nothing',
      [initial.revision, JSON.stringify(initial)],
    );
  }

  async load(): Promise<DemoData> {
    const { rows } = await this.pool.query<{ data: DemoData }>('select data from app_state where id = 1');
    if (!rows[0]) throw new Error('app_state vazio: rode a migração');
    return rows[0].data;
  }

  async update<T>(fn: (data: DemoData) => { data: DemoData | null; result: T }): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<{ data: DemoData }>('select data from app_state where id = 1 for update');
      const { data, result } = fn(rows[0].data);
      if (data) await this.write(client, data);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async replace(baseRevision: number, data: DemoData) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<{ data: DemoData; revision: number }>(
        'select revision, data from app_state where id = 1 for update',
      );
      if (rows[0].revision !== baseRevision) {
        await client.query('rollback');
        return { ok: false as const, current: rows[0].data };
      }
      await this.write(client, data);
      await client.query('commit');
      return { ok: true as const };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async write(client: pg.PoolClient, data: DemoData) {
    const json = JSON.stringify(data);
    await client.query('update app_state set revision = $1, data = $2, updated_at = now() where id = 1', [data.revision, json]);
    await client.query('insert into app_state_history (revision, data) values ($1, $2)', [data.revision, json]);
  }

  async close() {
    await this.pool.end();
  }
}
