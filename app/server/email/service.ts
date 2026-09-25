import type { StateStore } from '../state';
import type { EmailLog, EmailLogEntry } from './log';
import type { Mailer } from './mailer';
import { renderEmail } from './templates';
import { isJobStillValid, reminderJobs, type EmailJob } from './triggers';

const MINUTE = 60_000;
/** Espera antes de cada nova tentativa (1, 5, 15, 60 min). */
const BACKOFF_MINUTES = [1, 5, 15, 60];

export const backoffMs = (attempts: number) =>
  BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1] * MINUTE;

/** O que as rotas HTTP usam: nunca bloqueia nem falha a resposta. */
export interface EmailNotifier {
  readonly enabled: boolean;
  notify(jobs: EmailJob[]): void;
  history(reservationId: string): Promise<EmailLogEntry[]>;
}

export const disabledNotifier: EmailNotifier = {
  enabled: false,
  notify: () => undefined,
  history: async () => [],
};

export interface EmailServiceOptions {
  mailer: Mailer;
  log: EmailLog;
  store: StateStore;
  publicUrl: string;
  clock?: () => number;
  logger?: Pick<Console, 'error' | 'log'>;
  batchSize?: number;
}

/**
 * Fila de e-mails: as rotas só enfileiram; o envio acontece em segundo plano,
 * com novas tentativas (até 5) e espera crescente entre elas. Cada tarefa é
 * conferida com os dados atuais na hora do envio.
 */
export class EmailService implements EmailNotifier {
  readonly enabled = true;
  private readonly options: EmailServiceOptions;
  private readonly clock: () => number;
  private readonly logger: Pick<Console, 'error' | 'log'>;
  private running: Promise<void> | null = null;
  private again = false;

  constructor(options: EmailServiceOptions) {
    this.options = options;
    this.clock = options.clock ?? Date.now;
    this.logger = options.logger ?? console;
  }

  notify(jobs: EmailJob[]): void {
    if (!jobs.length) return;
    void this.enqueue(jobs)
      .then(() => this.processDue())
      .catch((error) => this.logger.error('[email] falha ao enfileirar', error));
  }

  async enqueue(jobs: EmailJob[]): Promise<void> {
    const nowMs = this.clock();
    for (const job of jobs) await this.options.log.enqueue(job, nowMs);
  }

  history(reservationId: string): Promise<EmailLogEntry[]> {
    return this.options.log.listByReservation(reservationId);
  }

  /** Passo do trabalho periódico: agenda lembretes devidos e envia a fila. */
  async tick(): Promise<void> {
    try {
      await this.enqueue(reminderJobs(await this.options.store.load(), this.clock()));
    } catch (error) {
      this.logger.error('[email] falha ao agendar lembretes', error);
    }
    await this.processDue();
  }

  /** Envia o que estiver pendente. Chamadas simultâneas esperam a atual (e a repetem uma vez). */
  processDue(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.processBatch();
        } while (this.again);
      } catch (error) {
        this.logger.error('[email] falha ao processar a fila', error);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async processBatch(): Promise<void> {
    const { log, store, mailer, publicUrl } = this.options;
    const batchSize = this.options.batchSize ?? 20;
    const due = await log.due(this.clock(), batchSize);
    if (!due.length) return;
    if (due.length === batchSize) this.again = true;
    const data = await store.load();
    for (const entry of due) {
      const nowMs = this.clock();
      const reservation = data.reservations.find((r) => r.id === entry.reservationId);
      const job: EmailJob = { kind: entry.kind, reservationId: entry.reservationId, key: entry.key };
      if (!reservation || !isJobStillValid(job, reservation, nowMs)) {
        await log.markSkipped(entry.id, 'não se aplica mais aos dados atuais');
        continue;
      }
      try {
        const email = renderEmail(entry.kind, reservation, {
          publicUrl,
          customerCancelMinutes: data.settings.rules.customerCancelMinutes,
        });
        await mailer.send({ to: { email: reservation.customer.email, name: reservation.customer.name }, ...email });
        await log.markSent(entry.id, this.clock());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await log.markFailed(entry.id, message, this.clock() + backoffMs(entry.attempts + 1));
        this.logger.error(`[email] envio ${entry.key} falhou (tentativa ${entry.attempts + 1}): ${message}`);
      }
    }
  }
}
