import { LIMITS } from './defaults';
import { err, fail, ok, type DomainError, type DomainWarning, type Result } from './errors';
import {
  findConflicts,
  isSharedTable,
  overloadedReservationIds,
  plannedBlockEnd,
  plannedServiceEnd,
  prepEndMs,
  segmentsForTable,
  tableConflicts,
  tableParams,
} from './occupancy';
import { replaceReservation } from './reservations';
import { MINUTE_MS, toIso, toMs } from './time';
import type { DemoData, Reservation } from './types';

type Outcome = Result<{ data: DemoData; reservation: Reservation }>;

function statusError(reservation: Reservation): DomainError {
  return reservation.status === 'cancelled'
    ? err('ALREADY_CANCELLED')
    : err('STATUS_NOT_ALLOWED', { params: { status: reservation.status } });
}

export function validateReason(reason: string): DomainError | null {
  const text = reason.trim();
  if (text.length < LIMITS.reasonLength.min) return err('REASON_REQUIRED', { field: 'reason', params: { min: LIMITS.reasonLength.min } });
  if (text.length > LIMITS.reasonLength.max) return err('REASON_TOO_LONG', { field: 'reason', params: { max: LIMITS.reasonLength.max } });
  return null;
}

/**
 * Chegada: exige mesa livre agora e até o fim previsto, sem sobrepor ocupação
 * atual. Chegadas muito antecipadas geram aviso; tardias não deslocam ninguém.
 */
export function checkArrival(data: DemoData, reservation: Reservation, nowMs: number): Result<{ minutesFromStart: number }> {
  if (reservation.status !== 'confirmed') return fail(statusError(reservation));
  const start = toMs(reservation.startAt);
  if (nowMs < start - LIMITS.earlyArrivalMaxMinutes * MINUTE_MS) {
    return fail(err('ARRIVAL_TOO_EARLY', { params: { minutes: LIMITS.earlyArrivalMaxMinutes } }));
  }
  if (nowMs >= plannedServiceEnd(reservation)) return fail(err('ARRIVAL_WINDOW_ENDED'));
  const table = data.tables.find((t) => t.id === reservation.tableId);
  if (!table || !table.active) return fail(err('TABLE_INACTIVE', { params: tableParams(table, reservation.tableId) }));

  const others = segmentsForTable(data, reservation.tableId, nowMs, { excludeReservationId: reservation.id, relevantFrom: nowMs });
  // Área compartilhada: basta haver lugares para o grupo desde agora até o fim previsto.
  const conflicts = tableConflicts(table, others, { start: nowMs, end: plannedBlockEnd(reservation) }, reservation.partySize);
  if (conflicts.length) return fail(err('TABLE_BUSY_NOW', { conflicts, params: tableParams(table) }));

  const minutesFromStart = Math.round((nowMs - start) / MINUTE_MS);
  const warnings: DomainWarning[] = [];
  if (-minutesFromStart > LIMITS.earlyArrivalWarnMinutes) {
    warnings.push({ code: 'EARLY_ARRIVAL', params: { minutes: -minutesFromStart } });
  } else if (minutesFromStart > data.settings.rules.arrivalToleranceMinutes) {
    warnings.push({ code: 'LATE_ARRIVAL', params: { minutes: minutesFromStart } });
  }
  return ok({ minutesFromStart }, warnings);
}

export function registerArrival(data: DemoData, id: string, nowMs: number): Outcome {
  const r = data.reservations.find((item) => item.id === id);
  if (!r) return fail(err('NOT_FOUND'));
  const check = checkArrival(data, r, nowMs);
  if (!check.ok) return check;
  const at = toIso(nowMs);
  const updated: Reservation = {
    ...r,
    status: 'seated',
    seatedAt: at,
    updatedAt: at,
    history: [...r.history, { at, kind: 'arrived', actor: 'admin', minutes: check.value.minutesFromStart }],
  };
  return ok({ data: replaceReservation(data, updated), reservation: updated }, check.warnings);
}

/** Concluir inicia a preparação com o valor salvo na reserva. */
export function completeService(data: DemoData, id: string, nowMs: number): Outcome {
  const found = data.reservations.find((r) => r.id === id);
  if (!found) return fail(err('NOT_FOUND'));
  if (found.status !== 'seated') return fail(statusError(found));
  const at = toIso(nowMs);
  const updated: Reservation = {
    ...found,
    status: 'completed',
    completedAt: at,
    updatedAt: at,
    history: [...found.history, { at, kind: 'completed', actor: 'admin', minutes: found.prepMinutes }],
  };
  const next = replaceReservation(data, updated);
  const warnings: DomainWarning[] = [];
  const prepEnd = prepEndMs(updated) ?? nowMs;
  const table = data.tables.find((t) => t.id === found.tableId);
  if (isSharedTable(table) && table) {
    // Área: avisa só se a preparação deixar a área acima da capacidade.
    const overloaded = overloadedReservationIds(
      segmentsForTable(next, found.tableId, nowMs, { relevantFrom: nowMs }).filter((s) => s.start < prepEnd),
      table.capacity,
      nowMs,
    ).filter((rid) => rid !== id);
    if (overloaded.length) {
      warnings.push({ code: 'PREP_OVERLAPS_NEXT', reservationIds: overloaded, params: tableParams(table) });
    }
  } else {
    const overlapping = findConflicts(
      segmentsForTable(next, found.tableId, nowMs, { excludeReservationId: id, relevantFrom: nowMs }),
      { start: nowMs, end: prepEnd },
    ).filter((c) => c.kind === 'reservation');
    if (overlapping.length) {
      warnings.push({ code: 'PREP_OVERLAPS_NEXT', reservationIds: [...new Set(overlapping.map((c) => c.id))], params: { table: found.tableId } });
    }
  }
  return ok({ data: next, reservation: updated }, warnings);
}

export function isPrepActive(reservation: Reservation, nowMs: number): boolean {
  const end = prepEndMs(reservation);
  return end !== null && reservation.completedAt !== null && toMs(reservation.completedAt) <= nowMs && nowMs < end;
}

export function endPrepEarly(data: DemoData, id: string, nowMs: number): Outcome {
  const found = data.reservations.find((r) => r.id === id);
  if (!found) return fail(err('NOT_FOUND'));
  if (found.status !== 'completed') return fail(statusError(found));
  if (!isPrepActive(found, nowMs)) return fail(err('PREP_NOT_ACTIVE'));
  const remaining = Math.ceil(((prepEndMs(found) ?? nowMs) - nowMs) / MINUTE_MS);
  const at = toIso(nowMs);
  const updated: Reservation = {
    ...found,
    prepEndedAt: at,
    updatedAt: at,
    history: [...found.history, { at, kind: 'prep_ended', actor: 'admin', minutes: remaining }],
  };
  return ok({ data: replaceReservation(data, updated), reservation: updated });
}

/** Estende a preparação com motivo, validando reservas e bloqueios futuros. */
export function extendPrep(data: DemoData, id: string, minutes: number, reason: string, nowMs: number): Outcome {
  const found = data.reservations.find((r) => r.id === id);
  if (!found) return fail(err('NOT_FOUND'));
  if (found.status !== 'completed') return fail(statusError(found));
  if (!isPrepActive(found, nowMs)) return fail(err('PREP_NOT_ACTIVE'));
  const range = LIMITS.prepExtension;
  if (!Number.isInteger(minutes) || minutes < range.min || minutes > range.max || minutes % range.step !== 0) {
    return fail(err('EXTENSION_INVALID', { field: 'minutes', params: { ...range } }));
  }
  const reasonError = validateReason(reason);
  if (reasonError) return fail(reasonError);
  const currentEnd = prepEndMs(found) ?? nowMs;
  const table = data.tables.find((t) => t.id === found.tableId);
  const conflicts = tableConflicts(
    table ?? { capacity: 0 },
    segmentsForTable(data, found.tableId, nowMs, { excludeReservationId: id, relevantFrom: nowMs }),
    { start: currentEnd, end: currentEnd + minutes * MINUTE_MS },
    found.partySize,
  );
  if (conflicts.length) return fail(err('CONFLICT', { field: 'minutes', conflicts, params: tableParams(table, found.tableId) }));
  const at = toIso(nowMs);
  const updated: Reservation = {
    ...found,
    prepExtensionMinutes: found.prepExtensionMinutes + minutes,
    updatedAt: at,
    history: [...found.history, { at, kind: 'prep_extended', actor: 'admin', minutes, reason: reason.trim() }],
  };
  return ok({ data: replaceReservation(data, updated), reservation: updated });
}

export type CustomerCancelState = 'allowed' | 'deadline_passed' | 'already_cancelled' | 'not_cancellable';

export function customerCancelState(data: DemoData, reservation: Reservation, nowMs: number): CustomerCancelState {
  if (reservation.status === 'cancelled') return 'already_cancelled';
  if (reservation.status !== 'confirmed') return 'not_cancellable';
  const deadline = toMs(reservation.startAt) - data.settings.rules.customerCancelMinutes * MINUTE_MS;
  return nowMs <= deadline ? 'allowed' : 'deadline_passed';
}

export function cancelByCustomer(data: DemoData, id: string, nowMs: number): Outcome {
  const found = data.reservations.find((r) => r.id === id);
  if (!found) return fail(err('NOT_FOUND'));
  const state = customerCancelState(data, found, nowMs);
  if (state === 'already_cancelled') return fail(err('ALREADY_CANCELLED'));
  if (state === 'not_cancellable') return fail(statusError(found));
  if (state === 'deadline_passed') {
    return fail(err('CANCEL_DEADLINE_PASSED', { params: { minutes: data.settings.rules.customerCancelMinutes } }));
  }
  const at = toIso(nowMs);
  const updated: Reservation = {
    ...found,
    status: 'cancelled',
    cancelledAt: at,
    cancelledBy: 'customer',
    cancelReason: null,
    updatedAt: at,
    history: [...found.history, { at, kind: 'cancelled', actor: 'customer' }],
  };
  return ok({ data: replaceReservation(data, updated), reservation: updated });
}

export function cancelByAdmin(data: DemoData, id: string, reason: string, nowMs: number): Outcome {
  const found = data.reservations.find((r) => r.id === id);
  if (!found) return fail(err('NOT_FOUND'));
  if (found.status !== 'confirmed') return fail(statusError(found));
  const reasonError = validateReason(reason);
  if (reasonError) return fail(reasonError);
  const at = toIso(nowMs);
  const updated: Reservation = {
    ...found,
    status: 'cancelled',
    cancelledAt: at,
    cancelledBy: 'admin',
    cancelReason: reason.trim(),
    updatedAt: at,
    history: [...found.history, { at, kind: 'cancelled', actor: 'admin', reason: reason.trim() }],
  };
  return ok({ data: replaceReservation(data, updated), reservation: updated });
}

/** Ausência: ação administrativa permitida somente após início + tolerância. */
export function noShowAvailableAt(data: DemoData, reservation: Reservation): number {
  return toMs(reservation.startAt) + data.settings.rules.arrivalToleranceMinutes * MINUTE_MS;
}

export function markNoShow(data: DemoData, id: string, nowMs: number): Outcome {
  const found = data.reservations.find((r) => r.id === id);
  if (!found) return fail(err('NOT_FOUND'));
  if (found.status !== 'confirmed') return fail(statusError(found));
  const availableAt = noShowAvailableAt(data, found);
  if (nowMs < availableAt) {
    return fail(err('NO_SHOW_TOO_EARLY', { params: { minutes: data.settings.rules.arrivalToleranceMinutes, at: toIso(availableAt) } }));
  }
  const at = toIso(nowMs);
  const updated: Reservation = {
    ...found,
    status: 'no_show',
    noShowAt: at,
    updatedAt: at,
    history: [...found.history, { at, kind: 'no_show', actor: 'admin' }],
  };
  return ok({ data: replaceReservation(data, updated), reservation: updated });
}

export type ReservationAction =
  | 'edit'
  | 'changeTable'
  | 'arrive'
  | 'complete'
  | 'endPrep'
  | 'extendPrep'
  | 'cancel'
  | 'noShow';

export interface ActionState {
  allowed: boolean;
  error?: DomainError;
}

/** Ações permitidas no estado atual (cada ação é revalidada ao executar). */
export function getActionStates(data: DemoData, reservation: Reservation, nowMs: number): Record<ReservationAction, ActionState> {
  const editable = reservation.status === 'confirmed' || reservation.status === 'seated';
  const statusOnly = (allowed: boolean): ActionState => (allowed ? { allowed } : { allowed, error: statusError(reservation) });
  const arrival = checkArrival(data, reservation, nowMs);
  const prepActive = reservation.status === 'completed' && isPrepActive(reservation, nowMs);
  const noShowReady = reservation.status === 'confirmed' && nowMs >= noShowAvailableAt(data, reservation);
  return {
    edit: editable ? { allowed: true } : { allowed: false, error: err('NOT_EDITABLE', { params: { status: reservation.status } }) },
    changeTable: statusOnly(editable),
    arrive: arrival.ok ? { allowed: true } : { allowed: false, error: arrival.errors[0] },
    complete: statusOnly(reservation.status === 'seated'),
    endPrep: prepActive ? { allowed: true } : { allowed: false, error: err('PREP_NOT_ACTIVE') },
    extendPrep: prepActive ? { allowed: true } : { allowed: false, error: err('PREP_NOT_ACTIVE') },
    cancel: statusOnly(reservation.status === 'confirmed'),
    noShow:
      reservation.status !== 'confirmed'
        ? statusOnly(false)
        : noShowReady
          ? { allowed: true }
          : {
              allowed: false,
              error: err('NO_SHOW_TOO_EARLY', {
                params: {
                  minutes: data.settings.rules.arrivalToleranceMinutes,
                  at: toIso(noShowAvailableAt(data, reservation)),
                },
              }),
            },
  };
}
