import { LIMITS } from './defaults';
import { getLiveTableStatus, plannedServiceEnd } from './occupancy';
import { MINUTE_MS, parisDate, toMs } from './time';
import type { DemoData, Reservation } from './types';

export type AlertKind = 'late_arrival' | 'tolerance_exceeded' | 'overstay' | 'next_at_risk' | 'pending_update';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface OperationalAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  tableId?: string;
  reservationId?: string;
  /** Reserva seguinte afetada (alerta de mesa ainda ocupada). */
  nextReservationId?: string;
  minutes?: number;
  /** Instante previsto de liberação da mesa. */
  freeAt?: number;
  reservationIds?: string[];
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Alertas operacionais. Nenhum alerta altera dados: atrasos não deslocam
 * outras reservas e nada é concluído ou marcado como ausência automaticamente.
 */
export function getOperationalAlerts(data: DemoData, nowMs: number): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const tolerance = data.settings.rules.arrivalToleranceMinutes;
  const pending: Reservation[] = [];

  for (const r of data.reservations) {
    if (r.status === 'confirmed') {
      const start = toMs(r.startAt);
      if (plannedServiceEnd(r) <= nowMs) {
        pending.push(r);
      } else if (nowMs >= start + MINUTE_MS) {
        const minutes = Math.floor((nowMs - start) / MINUTE_MS);
        const exceeded = nowMs >= start + tolerance * MINUTE_MS;
        alerts.push({
          id: `late-${r.id}`,
          kind: exceeded ? 'tolerance_exceeded' : 'late_arrival',
          severity: exceeded ? 'warning' : 'info',
          tableId: r.tableId,
          reservationId: r.id,
          minutes,
        });
      }
    } else if (r.status === 'seated' && nowMs > plannedServiceEnd(r)) {
      alerts.push({
        id: `overstay-${r.id}`,
        kind: 'overstay',
        severity: 'warning',
        tableId: r.tableId,
        reservationId: r.id,
        minutes: Math.floor((nowMs - plannedServiceEnd(r)) / MINUTE_MS),
      });
    }
  }

  // Mesa que continua ocupada (ou em preparação/bloqueada) perto ou além da próxima reserva.
  for (const table of data.tables) {
    const status = getLiveTableStatus(table, data, nowMs);
    if (!['occupied', 'prep', 'blocked'].includes(status.state)) continue;
    const next = status.nextReservation;
    if (!next || status.until === undefined) continue;
    const freeAt =
      status.state === 'occupied' && status.reservation
        ? status.until + status.reservation.prepMinutes * MINUTE_MS
        : status.until;
    const nextStart = toMs(next.startAt);
    if (freeAt > nextStart - LIMITS.nextReservationAlertMinutes * MINUTE_MS) {
      alerts.push({
        id: `risk-${table.id}-${next.id}`,
        kind: 'next_at_risk',
        severity: freeAt > nextStart ? 'critical' : 'warning',
        tableId: table.id,
        reservationId: status.reservation?.id,
        nextReservationId: next.id,
        freeAt,
        minutes: Math.round((freeAt - nextStart) / MINUTE_MS),
      });
    }
  }

  if (pending.length) {
    alerts.push({
      id: 'pending-updates',
      kind: 'pending_update',
      severity: 'warning',
      reservationIds: pending.sort((a, b) => toMs(a.startAt) - toMs(b.startAt)).map((r) => r.id),
      minutes: pending.length,
    });
  }

  return alerts.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.tableId ?? '').localeCompare(b.tableId ?? ''),
  );
}

/** Reservas confirmadas de hoje que ainda podem chegar (inclui atrasadas dentro do período). */
export function upcomingArrivals(data: DemoData, nowMs: number): Reservation[] {
  const today = parisDate(nowMs);
  return data.reservations
    .filter((r) => r.status === 'confirmed' && parisDate(toMs(r.startAt)) === today && plannedServiceEnd(r) > nowMs)
    .sort((a, b) => toMs(a.startAt) - toMs(b.startAt));
}
