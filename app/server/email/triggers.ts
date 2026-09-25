import { isValidEmail } from '../../src/domain/customer';
import { addDays, localToMs, parisDate, toMs } from '../../src/domain/time';
import type { DemoData, Reservation } from '../../src/domain/types';
import type { EmailKind } from './messages';

/**
 * Quais e-mails cada mudança gera. Funções puras: recebem os dados e devolvem
 * "tarefas" com uma chave única (a chave evita enviar o mesmo e-mail duas vezes).
 */

export interface EmailJob {
  kind: EmailKind;
  reservationId: string;
  key: string;
}

/** Horário (Paris) do lembrete, no dia anterior à reserva. */
export const REMINDER_TIME = '10:00';

export const hasEmail = (r: Reservation) => Boolean(r.customer.email) && isValidEmail(r.customer.email);
const isFuture = (r: Reservation, nowMs: number) => toMs(r.startAt) > nowMs;

export const jobKey = {
  confirm: (r: Reservation) => `confirm:${r.id}`,
  change: (r: Reservation) => `change:${r.id}:${r.startAt}:${r.partySize}`,
  cancel: (r: Reservation) => `cancel:${r.id}`,
  reminder: (r: Reservation) => `reminder:${r.id}:${parisDate(toMs(r.startAt))}`,
};

export function jobFor(kind: EmailKind, r: Reservation): EmailJob {
  return { kind, reservationId: r.id, key: jobKey[kind](r) };
}

export function confirmationJobs(r: Reservation, nowMs: number): EmailJob[] {
  return r.status === 'confirmed' && hasEmail(r) && isFuture(r, nowMs) ? [jobFor('confirm', r)] : [];
}

export function cancellationJobs(r: Reservation, nowMs: number): EmailJob[] {
  return r.status === 'cancelled' && hasEmail(r) && isFuture(r, nowMs) ? [jobFor('cancel', r)] : [];
}

/**
 * Diferença entre o documento anterior e o novo (gravação da administração):
 * reserva nova confirmada → confirmação; confirmada que virou cancelada →
 * cancelamento; data/horário ou pessoas alterados → alteração; e-mail
 * informado depois numa reserva que não tinha → confirmação.
 */
export function diffEmailJobs(previous: DemoData, next: DemoData, nowMs: number): EmailJob[] {
  const before = new Map(previous.reservations.map((r) => [r.id, r]));
  const jobs: EmailJob[] = [];
  for (const r of next.reservations) {
    const old = before.get(r.id);
    if (!old) {
      jobs.push(...confirmationJobs(r, nowMs));
      continue;
    }
    if (old.status === 'confirmed' && r.status === 'cancelled') {
      jobs.push(...cancellationJobs(r, nowMs));
      continue;
    }
    if (r.status !== 'confirmed' || !hasEmail(r) || !isFuture(r, nowMs)) continue;
    if (!hasEmail(old) || old.status !== 'confirmed') {
      jobs.push(jobFor('confirm', r));
    } else if (old.startAt !== r.startAt || old.partySize !== r.partySize) {
      jobs.push(jobFor('change', r));
    }
  }
  return jobs;
}

/** Instante do lembrete: 10:00 de Paris do dia anterior (respeita o horário de verão). */
export function reminderAtMs(r: Reservation): number {
  const previousDay = addDays(parisDate(toMs(r.startAt)), -1);
  return localToMs(previousDay, REMINDER_TIME) ?? toMs(r.startAt);
}

/** Última vez que dia ou horário foram definidos (criação ou edição do horário). */
function scheduledAtMs(r: Reservation): number {
  let last = toMs(r.createdAt);
  for (const entry of r.history) {
    if (entry.kind === 'updated' && entry.changes?.some((c) => c.field === 'date' || c.field === 'time')) {
      last = Math.max(last, toMs(entry.at));
    }
  }
  return last;
}

/**
 * Lembretes devidos agora: reservas confirmadas de amanhã (Paris), a partir das
 * 10:00 de hoje. Quem reservou (ou mudou para amanhã) depois das 10:00 de hoje,
 * ou para o mesmo dia, não recebe lembrete: a confirmação acabou de chegar.
 */
export function reminderJobs(data: DemoData, nowMs: number): EmailJob[] {
  const today = parisDate(nowMs);
  const jobs: EmailJob[] = [];
  for (const r of data.reservations) {
    if (r.status !== 'confirmed' || !hasEmail(r) || !isFuture(r, nowMs)) continue;
    const start = toMs(r.startAt);
    if (addDays(today, 1) !== parisDate(start)) continue;
    const remindAt = reminderAtMs(r);
    if (nowMs < remindAt || scheduledAtMs(r) >= remindAt) continue;
    jobs.push(jobFor('reminder', r));
  }
  return jobs;
}

/**
 * Confere, na hora do envio, se o e-mail ainda faz sentido com os dados atuais
 * (ex.: não confirmar reserva já cancelada, não enviar alteração antiga).
 */
export function isJobStillValid(job: EmailJob, r: Reservation | undefined, nowMs: number): boolean {
  if (!r || !hasEmail(r) || !isFuture(r, nowMs)) return false;
  switch (job.kind) {
    case 'confirm':
      return r.status === 'confirmed';
    case 'change':
      return r.status === 'confirmed' && job.key === jobKey.change(r);
    case 'cancel':
      return r.status === 'cancelled';
    case 'reminder':
      return r.status === 'confirmed' && job.key === jobKey.reminder(r) && parisDate(nowMs) === addDays(parisDate(toMs(r.startAt)), -1);
  }
}
