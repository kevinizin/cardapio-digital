import type { ConflictInfo } from './errors';
import { containsInstant, overlaps } from './intervals';
import { LIMITS } from './defaults';
import { MINUTE_MS, parisDate, toMs } from './time';
import type { DemoData, Interval, Reservation, Table, TableBlock } from './types';

export type SegmentKind = 'service' | 'prep' | 'block';
/** planned = previsão da reserva; real = registrado; projected = estimado a partir de agora. */
export type SegmentBasis = 'planned' | 'real' | 'projected';

export interface OccupancySegment extends Interval {
  kind: SegmentKind;
  basis: SegmentBasis;
  tableId: string;
  reservationId?: string;
  blockId?: string;
}

type OccupancyData = Pick<DemoData, 'reservations' | 'blocks'>;

export interface OccupancyOptions {
  excludeReservationId?: string;
  excludeBlockId?: string;
  /** Ignora segmentos que terminam antes deste instante (otimização para buscas futuras). */
  relevantFrom?: number;
}

export function plannedServiceEnd(reservation: Reservation): number {
  return toMs(reservation.startAt) + reservation.serviceMinutes * MINUTE_MS;
}

export function plannedBlockEnd(reservation: Reservation): number {
  return plannedServiceEnd(reservation) + reservation.prepMinutes * MINUTE_MS;
}

/** Bloqueio previsto: do início até o término previsto + preparação. */
export function plannedInterval(reservation: Reservation): Interval {
  return { start: toMs(reservation.startAt), end: plannedBlockEnd(reservation) };
}

/** Quem está à mesa não é liberado só porque passou o término previsto. */
export function projectedServiceEnd(reservation: Reservation, nowMs: number): number {
  return Math.max(plannedServiceEnd(reservation), nowMs);
}

/** Fim real da preparação de uma reserva concluída (antecipado, padrão ou estendido). */
export function prepEndMs(reservation: Reservation): number | null {
  if (reservation.status !== 'completed' || !reservation.completedAt) return null;
  if (reservation.prepEndedAt) return toMs(reservation.prepEndedAt);
  return toMs(reservation.completedAt) + (reservation.prepMinutes + reservation.prepExtensionMinutes) * MINUTE_MS;
}

/**
 * Segmentos que ocupam a mesa:
 * - confirmada: atendimento e preparação previstos;
 * - cliente presente: desde a chegada (ou início) até max(término previsto, agora) + preparação;
 * - concluída: período real de atendimento e de preparação;
 * - cancelada e ausência: liberam o período.
 */
export function reservationSegments(reservation: Reservation, nowMs: number): OccupancySegment[] {
  const base = { tableId: reservation.tableId, reservationId: reservation.id };
  const start = toMs(reservation.startAt);
  const prepMs = reservation.prepMinutes * MINUTE_MS;
  switch (reservation.status) {
    case 'confirmed': {
      const serviceEnd = plannedServiceEnd(reservation);
      const segments: OccupancySegment[] = [{ ...base, kind: 'service', basis: 'planned', start, end: serviceEnd }];
      if (prepMs > 0) segments.push({ ...base, kind: 'prep', basis: 'planned', start: serviceEnd, end: serviceEnd + prepMs });
      return segments;
    }
    case 'seated': {
      const seatedAt = reservation.seatedAt ? toMs(reservation.seatedAt) : start;
      const serviceEnd = projectedServiceEnd(reservation, nowMs);
      const segments: OccupancySegment[] = [
        { ...base, kind: 'service', basis: 'real', start: Math.min(start, seatedAt), end: serviceEnd },
      ];
      if (prepMs > 0) segments.push({ ...base, kind: 'prep', basis: 'projected', start: serviceEnd, end: serviceEnd + prepMs });
      return segments;
    }
    case 'completed': {
      const realStart = reservation.seatedAt ? toMs(reservation.seatedAt) : start;
      const realEnd = reservation.completedAt ? toMs(reservation.completedAt) : plannedServiceEnd(reservation);
      const segments: OccupancySegment[] = [];
      if (realEnd > realStart) segments.push({ ...base, kind: 'service', basis: 'real', start: realStart, end: realEnd });
      const prepEnd = prepEndMs(reservation);
      if (prepEnd !== null && prepEnd > realEnd) {
        segments.push({ ...base, kind: 'prep', basis: 'real', start: realEnd, end: prepEnd });
      }
      return segments;
    }
    default:
      return [];
  }
}

export function blockSegment(block: TableBlock): OccupancySegment {
  return {
    kind: 'block',
    basis: 'planned',
    tableId: block.tableId,
    blockId: block.id,
    start: toMs(block.startAt),
    end: toMs(block.endAt),
  };
}

export function segmentsForTable(
  data: OccupancyData,
  tableId: string,
  nowMs: number,
  options: OccupancyOptions = {},
): OccupancySegment[] {
  const segments: OccupancySegment[] = [];
  for (const reservation of data.reservations) {
    if (reservation.tableId !== tableId || reservation.id === options.excludeReservationId) continue;
    segments.push(...reservationSegments(reservation, nowMs));
  }
  for (const block of data.blocks) {
    if (block.tableId !== tableId || block.id === options.excludeBlockId) continue;
    segments.push(blockSegment(block));
  }
  return segments
    .filter((s) => options.relevantFrom === undefined || s.end > options.relevantFrom)
    .sort((a, b) => a.start - b.start);
}

/** Índice de ocupação por mesa, usado nas buscas de disponibilidade. */
export function buildOccupancyIndex(
  data: OccupancyData,
  nowMs: number,
  options: OccupancyOptions = {},
): Map<string, OccupancySegment[]> {
  const index = new Map<string, OccupancySegment[]>();
  const push = (segment: OccupancySegment) => {
    if (options.relevantFrom !== undefined && segment.end <= options.relevantFrom) return;
    const list = index.get(segment.tableId);
    if (list) list.push(segment);
    else index.set(segment.tableId, [segment]);
  };
  for (const reservation of data.reservations) {
    if (reservation.id === options.excludeReservationId) continue;
    reservationSegments(reservation, nowMs).forEach(push);
  }
  for (const block of data.blocks) {
    if (block.id === options.excludeBlockId) continue;
    push(blockSegment(block));
  }
  for (const list of index.values()) list.sort((a, b) => a.start - b.start);
  return index;
}

export function toConflictInfo(segment: OccupancySegment): ConflictInfo {
  return {
    kind: segment.blockId ? 'block' : 'reservation',
    id: (segment.blockId ?? segment.reservationId) as string,
    tableId: segment.tableId,
    segment: segment.kind,
    start: segment.start,
    end: segment.end,
  };
}

export function findConflicts(segments: readonly OccupancySegment[], interval: Interval): ConflictInfo[] {
  return segments.filter((segment) => overlaps(segment, interval)).map(toConflictInfo);
}

export type LiveTableState = 'free' | 'reserved' | 'occupied' | 'prep' | 'blocked' | 'inactive';

export interface LiveTableStatus {
  tableId: string;
  state: LiveTableState;
  reservation?: Reservation;
  block?: TableBlock;
  since?: number;
  until?: number;
  /** Cliente presente além do término previsto. */
  overdue: boolean;
  /** Próxima reserva confirmada de hoje nesta mesa, depois de agora. */
  nextReservation?: Reservation;
}

/** Situação REAL da mesa agora (não é previsão). */
export function getLiveTableStatus(table: Table, data: OccupancyData, nowMs: number): LiveTableStatus {
  const own = data.reservations.filter((r) => r.tableId === table.id);
  const today = parisDate(nowMs);
  const nextReservation = own
    .filter((r) => r.status === 'confirmed' && toMs(r.startAt) > nowMs && parisDate(toMs(r.startAt)) === today)
    .sort((a, b) => toMs(a.startAt) - toMs(b.startAt))[0];
  const base = { tableId: table.id, overdue: false, nextReservation };

  if (!table.active) return { ...base, state: 'inactive' };

  const seated = own
    .filter((r) => r.status === 'seated')
    .sort((a, b) => toMs(a.seatedAt ?? a.startAt) - toMs(b.seatedAt ?? b.startAt))[0];
  if (seated) {
    return {
      ...base,
      state: 'occupied',
      reservation: seated,
      since: toMs(seated.seatedAt ?? seated.startAt),
      until: projectedServiceEnd(seated, nowMs),
      overdue: nowMs > plannedServiceEnd(seated),
    };
  }

  const inPrep = own.find((r) => {
    const end = prepEndMs(r);
    return end !== null && r.completedAt !== null && toMs(r.completedAt) <= nowMs && nowMs < end;
  });
  if (inPrep && inPrep.completedAt) {
    return { ...base, state: 'prep', reservation: inPrep, since: toMs(inPrep.completedAt), until: prepEndMs(inPrep) ?? undefined };
  }

  const block = data.blocks.find((b) => b.tableId === table.id && containsInstant(blockSegment(b), nowMs));
  if (block) {
    return { ...base, state: 'blocked', block, since: toMs(block.startAt), until: toMs(block.endAt) };
  }

  const held = own
    .filter(
      (r) =>
        r.status === 'confirmed' &&
        nowMs >= toMs(r.startAt) - LIMITS.reservedLookaheadMinutes * MINUTE_MS &&
        nowMs < plannedBlockEnd(r),
    )
    .sort((a, b) => toMs(a.startAt) - toMs(b.startAt))[0];
  if (held) {
    return { ...base, state: 'reserved', reservation: held, since: toMs(held.startAt), until: plannedBlockEnd(held) };
  }

  return { ...base, state: 'free' };
}

export interface ForecastTableStatus {
  tableId: string;
  state: LiveTableState;
  reservation?: Reservation;
  block?: TableBlock;
  segment?: OccupancySegment;
}

/** Disponibilidade PREVISTA num instante futuro, derivada das reservas e bloqueios. */
export function getForecastTableStatus(
  table: Table,
  data: OccupancyData,
  atMs: number,
  nowMs: number,
): ForecastTableStatus {
  if (!table.active) return { tableId: table.id, state: 'inactive' };
  const segments = segmentsForTable(data, table.id, nowMs).filter((s) => containsInstant(s, atMs));
  const find = (predicate: (s: OccupancySegment, r?: Reservation) => boolean) =>
    segments.find((s) => predicate(s, data.reservations.find((r) => r.id === s.reservationId)));

  const occupied = find((s, r) => s.kind === 'service' && r?.status === 'seated');
  const reserved = find((s, r) => s.kind === 'service' && r?.status === 'confirmed');
  const prep = find((s) => s.kind === 'prep');
  const block = find((s) => s.kind === 'block');
  const chosen = occupied ?? reserved ?? prep ?? block;
  if (!chosen) return { tableId: table.id, state: 'free' };

  const state: LiveTableState =
    chosen === occupied ? 'occupied' : chosen === reserved ? 'reserved' : chosen === prep ? 'prep' : 'blocked';
  return {
    tableId: table.id,
    state,
    segment: chosen,
    reservation: data.reservations.find((r) => r.id === chosen.reservationId),
    block: data.blocks.find((b) => b.id === chosen.blockId),
  };
}
