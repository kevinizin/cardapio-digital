import type { OperationalAlert } from '../../domain/alerts';
import { isSharedTable, plannedBlockEnd, plannedServiceEnd } from '../../domain/occupancy';
import { toMs } from '../../domain/time';
import type { ChangeField, DemoData, HistoryEntry, Reservation, Table } from '../../domain/types';
import { formatLocalDate, formatTime, t } from '../../i18n';
import type { Place } from '../../i18n/pt-BR/adminCore';

const h = t.history;

/** Mesa comum (identificação) ou área compartilhada (nome da área, ex.: "Salão"). */
export function placeOf(tables: readonly Table[], tableId: string): Place {
  const table = tables.find((tb) => tb.id === tableId);
  return table && isSharedTable(table)
    ? { id: tableId, name: t.area[table.area], shared: true }
    : { id: tableId, name: tableId, shared: false };
}

/** Rótulo curto para listas: "Mesa M01" ou "Salão". */
export function placeLabel(tables: readonly Table[], tableId: string): string {
  const place = placeOf(tables, tableId);
  return place.shared ? place.name : t.common.tableLabel(tableId);
}

/** Todas as mesas ativas são áreas compartilhadas (controle só por lugares). */
export function allShared(tables: readonly Table[]): boolean {
  return tables.length > 0 && tables.every(isSharedTable);
}

function changeValue(field: ChangeField, value: string, tables: readonly Table[]): string {
  if (!value) return '';
  if (field === 'date') return formatLocalDate(value);
  if (field === 'source') return t.source[value as keyof typeof t.source] ?? value;
  if (field === 'tableId') return placeOf(tables, value).name;
  return value;
}

/** Texto do histórico a partir dos dados estruturados (fácil de traduzir). */
export function historyText(entry: HistoryEntry, tables: readonly Table[] = []): { title: string; details: string[] } {
  const reason = entry.reason ? [h.reason(entry.reason)] : [];
  switch (entry.kind) {
    case 'created':
      return { title: h.created(entry.actor), details: [] };
    case 'updated':
    case 'table_changed':
      return {
        title: h[entry.kind],
        details: (entry.changes ?? []).map((change) =>
          h.change(h.fields[change.field], changeValue(change.field, change.from, tables), changeValue(change.field, change.to, tables)),
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
  const place = placeOf(data.tables, table);
  const minutes = alert.minutes ?? 0;
  switch (alert.kind) {
    case 'late_arrival':
      return a.late_arrival(name, place, minutes);
    case 'tolerance_exceeded':
      return a.tolerance_exceeded(name, place, minutes);
    case 'overstay':
      return a.overstay(name, place, minutes);
    case 'area_over_capacity': {
      const text = alert.severity === 'critical' ? a.areaCritical : a.areaWarning;
      return text(place.name, alert.people ?? 0, alert.capacity ?? 0, formatTime(alert.freeAt ?? 0));
    }
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
