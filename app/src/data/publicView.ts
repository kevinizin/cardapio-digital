import { normalizeCode } from '../domain/ids';
import { HOUR_MS, toMs } from '../domain/time';
import type { DemoData, Reservation } from '../domain/types';

/** Situações que ocupam mesa e por isso interessam ao cálculo de disponibilidade. */
const BLOCKING = new Set<Reservation['status']>(['confirmed', 'seated', 'completed']);

/** Código fictício das reservas alheias: nunca coincide com um código real normalizado. */
export const HIDDEN_CODE = '-';

/**
 * Versão pública dos dados: mantém só o necessário para calcular horários
 * livres (mesa, início, durações e situação). Nomes, contatos, códigos,
 * observações e históricos nunca saem do servidor para o site do cliente.
 */
export function toPublicData(data: DemoData, nowMs: number): DemoData {
  const since = nowMs - 12 * HOUR_MS;
  return {
    ...data,
    reservations: data.reservations
      .filter((r) => BLOCKING.has(r.status) && toMs(r.startAt) >= since)
      .map(redactReservation),
    blocks: data.blocks.filter((b) => toMs(b.endAt) >= since).map((b) => ({ ...b, reason: '' })),
  };
}

export function redactReservation(r: Reservation): Reservation {
  return {
    ...r,
    code: HIDDEN_CODE,
    customer: { name: '', email: '', phone: '', notes: '' },
    cancelReason: null,
    history: [],
  };
}

/** Busca por código + e-mail (sem diferenciar maiúsculas); não revela qual dos dois não confere. */
export function findByCodeAndEmail(data: DemoData, code: string, email: string): Reservation | undefined {
  const normalizedCode = normalizeCode(code);
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedCode || !normalizedEmail) return undefined;
  return data.reservations.find(
    (r) => r.code === normalizedCode && r.customer.email.trim().toLowerCase() === normalizedEmail,
  );
}
