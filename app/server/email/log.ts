import type pg from 'pg';
import type { EmailKind } from './messages';
import type { EmailJob } from './triggers';

/**
 * Registro dos e-mails (fila + histórico). A chave única impede enviar o
 * mesmo e-mail duas vezes, mesmo que a mesma mudança seja vista de novo.
 */

export type EmailStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface EmailLogEntry {
  id: number;
  reservationId: string;
  kind: EmailKind;
  key: string;
  status: EmailStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  nextAttemptAt: string;
}

export const MAX_ATTEMPTS = 5;

export interface EmailLog {
  /** Guarda a tarefa se a chave ainda não existe; devolve true se entrou agora. */
  enqueue(job: EmailJob, nowMs: number): Promise<boolean>;
  /** Pendentes ou com falha, abaixo do limite de tentativas e já no horário. */
  due(nowMs: number, limit: number): Promise<EmailLogEntry[]>;
  markSent(id: number, nowMs: number): Promise<void>;
  markFailed(id: number, error: string, nextAttemptMs: number): Promise<void>;
  markSkipped(id: number, reason: string): Promise<void>;
  listByReservation(reservationId: string): Promise<EmailLogEntry[]>;
}

const iso = (ms: number) => new Date(ms).toISOString();

export class MemoryEmailLog implements EmailLog {
  readonly entries: EmailLogEntry[] = [];
  private nextId = 1;

  async enqueue(job: EmailJob, nowMs: number) {
    if (this.entries.some((e) => e.key === job.key)) return false;
    this.entries.push({
      id: this.nextId++,
      reservationId: job.reservationId,
      kind: job.kind,
      key: job.key,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: iso(nowMs),
      sentAt: null,
      nextAttemptAt: iso(nowMs),
    });
    return true;
  }

  async due(nowMs: number, limit: number) {
    return this.entries
      .filter((e) => (e.status === 'pending' || e.status === 'failed') && e.attempts < MAX_ATTEMPTS && Date.parse(e.nextAttemptAt) <= nowMs)
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  private find(id: number) {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`email_log ${id} inexistente`);
    return entry;
  }

  async markSent(id: number, nowMs: number) {
    Object.assign(this.find(id), { status: 'sent', attempts: this.find(id).attempts + 1, sentAt: iso(nowMs), lastError: null });
  }

  async markFailed(id: number, error: string, nextAttemptMs: number) {
    const entry = this.find(id);
    Object.assign(entry, { status: 'failed', attempts: entry.attempts + 1, lastError: error.slice(0, 500), nextAttemptAt: iso(nextAttemptMs) });
  }

  async markSkipped(id: number, reason: string) {
    Object.assign(this.find(id), { status: 'skipped', lastError: reason });
  }

  async listByReservation(reservationId: string) {
    return this.entries.filter((e) => e.reservationId === reservationId).map((e) => ({ ...e }));
  }
}

interface Row {
  id: string;
  reservation_id: string;
  kind: EmailKind;
  key: string;
  status: EmailStatus;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  sent_at: Date | null;
  next_attempt_at: Date;
}

const fromRow = (row: Row): EmailLogEntry => ({
  id: Number(row.id),
  reservationId: row.reservation_id,
  kind: row.kind,
  key: row.key,
  status: row.status,
  attempts: row.attempts,
  lastError: row.last_error,
  createdAt: row.created_at.toISOString(),
  sentAt: row.sent_at ? row.sent_at.toISOString() : null,
  nextAttemptAt: row.next_attempt_at.toISOString(),
});

export class PgEmailLog implements EmailLog {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  async migrate(): Promise<void> {
    await this.pool.query(`
      create table if not exists email_log (
        id bigserial primary key,
        reservation_id text not null,
        kind text not null,
        key text not null unique,
        status text not null default 'pending',
        attempts integer not null default 0,
        last_error text,
        created_at timestamptz not null default now(),
        sent_at timestamptz,
        next_attempt_at timestamptz not null default now()
      );
      create index if not exists email_log_reservation_idx on email_log (reservation_id);
      create index if not exists email_log_due_idx on email_log (next_attempt_at) where status in ('pending', 'failed');
    `);
  }

  async enqueue(job: EmailJob, nowMs: number) {
    const { rowCount } = await this.pool.query(
      `insert into email_log (reservation_id, kind, key, created_at, next_attempt_at)
       values ($1, $2, $3, $4, $4) on conflict (key) do nothing`,
      [job.reservationId, job.kind, job.key, iso(nowMs)],
    );
    return (rowCount ?? 0) > 0;
  }

  async due(nowMs: number, limit: number) {
    const { rows } = await this.pool.query<Row>(
      `select * from email_log
        where status in ('pending', 'failed') and attempts < $1 and next_attempt_at <= $2
        order by next_attempt_at, id limit $3`,
      [MAX_ATTEMPTS, iso(nowMs), limit],
    );
    return rows.map(fromRow);
  }

  async markSent(id: number, nowMs: number) {
    await this.pool.query(
      `update email_log set status = 'sent', attempts = attempts + 1, sent_at = $2, last_error = null where id = $1`,
      [id, iso(nowMs)],
    );
  }

  async markFailed(id: number, error: string, nextAttemptMs: number) {
    await this.pool.query(
      `update email_log set status = 'failed', attempts = attempts + 1, last_error = $2, next_attempt_at = $3 where id = $1`,
      [id, error.slice(0, 500), iso(nextAttemptMs)],
    );
  }

  async markSkipped(id: number, reason: string) {
    await this.pool.query(`update email_log set status = 'skipped', last_error = $2 where id = $1`, [id, reason]);
  }

  async listByReservation(reservationId: string) {
    const { rows } = await this.pool.query<Row>('select * from email_log where reservation_id = $1 order by id', [reservationId]);
    return rows.map(fromRow);
  }
}
