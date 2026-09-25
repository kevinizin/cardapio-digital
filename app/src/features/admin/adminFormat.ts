import type { OperationalAlert } from '../../domain/alerts';
import { plannedBlockEnd, plannedServiceEnd } from '../../domain/occupancy';
import { toMs } from '../../domain/time';
import type { ChangeField, DemoData, HistoryEntry, Reservation } from '../../domain/types';
import { formatLocalDate, formatTime, t } from '../../i18n';

const h = t.history;

function changeValue(field: ChangeField, value: string): string {
  if (!value) return '';
  if (field === 'date') return formatLocalDate(value);
  if (field === 'source') return t.source[value as keyof typeof t.source] ?? value;
  return value;
}

/** Texto do histórico a partir dos dados estruturados (fácil de traduzir). */
export function historyText(entry: HistoryEntry): { title: string; details: string[] } {
  const reason = entry.reason ? [h.reason(entry.reason)] : [];
  switch (entry.kind) {
    case 'created':
      return { title: h.created(entry.actor), details: [] };
    case 'updated':
    case 'table_changed':
      return {
        title: h[entry.kind],
        details: (entry.changes ?? []).map((change) =>
          h.change(h.fields[change.field], changeValue(change.field, change.from), changeValue(change.field, change.to)),
        ),
      };
    case 'arrived':
      return { title: h.arrived(entry.minutes ?? 0), details: [] };
    case 'completed':
      return { title: h.completed(entry.minutes ?? 0), details: [] };
    case 'prep_ended':
      return { title: h.prep_ended(entry.minutes ?? 0), details: [] };
    case 'prep_extended':
      return { title: h.prep_extended(entry.minutes ?? 0), details: reason };
    case 'cancelled':
      return { title: h.cancelled(entry.actor), details: reason };
    case 'no_show':
      return { title: h.no_show, details: [] };
    default:
      return { title: String(entry.kind), details: [] };
  }
}

export function servicePeriod(reservation: Reservation): string {
  return `${formatTime(toMs(reservation.startAt))}–${formatTime(plannedServiceEnd(reservation))}`;
}

export function blockPeriod(reservation: Reservation): string {
  return `${formatTime(toMs(reservation.startAt))}–${formatTime(plannedBlockEnd(reservation))}`;
}

export function alertText(alert: OperationalAlert, data: DemoData): string {
  const a = t.admin.alerts;
  const reservation = data.reservations.find((r) => r.id === alert.reservationId);
  const next = data.reservations.find((r) => r.id === alert.nextReservationId);
  const name = reservation?.customer.name ?? '';
  const table = alert.tableId ?? reservation?.tableId ?? '';
  const minutes = alert.minutes ?? 0;
  switch (alert.kind) {
    case 'late_arrival':
      return a.late_arrival(name, table, minutes);
    case 'tolerance_exceeded':
      return a.tolerance_exceeded(name, table, minutes);
    case 'overstay':
      return a.overstay(name, table, minutes);
    case 'next_at_risk': {
      const text = alert.severity === 'critical' ? a.nextCritical : a.nextWarning;
      return text(table, formatTime(alert.freeAt ?? 0), next ? formatTime(toMs(next.startAt)) : '', next?.customer.name ?? '');
    }
    case 'pending_update':
      return a.pending(alert.reservationIds?.length ?? 0);
    default:
      return '';
  }
}
