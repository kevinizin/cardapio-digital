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
  /** Pessoas da reserva (usado nas mesas compartilhadas, controladas por lugares). */
  partySize?: number;
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
  const base = { tableId: reservation.tableId, reservationId: reservation.id, partySize: reservation.partySize };
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

/** Mesa compartilhada: um conjunto de lugares (área) onde várias reservas coexistem. */
export function isSharedTable(table: Pick<Table, 'shared'> | undefined | null): boolean {
  return table?.shared === true;
}

/**
 * Parâmetros de erro que identificam a mesa; numa área compartilhada inclui
 * `area` para as mensagens falarem "Salão"/"Terraço" em vez do identificador.
 */
export function tableParams(table: Pick<Table, 'id' | 'area' | 'shared'> | undefined, fallbackId = ''): Record<string, string> {
  if (!table) return { table: fallbackId };
  return isSharedTable(table) ? { table: table.id, area: table.area } : { table: table.id };
}

/** Pessoas que um segmento ocupa numa área: bloqueio ocupa a área inteira. */
export function segmentLoad(segment: OccupancySegment, capacity: number): number {
  return segment.kind === 'block' ? capacity : (segment.partySize ?? 0);
}

export interface LoadPiece extends Interval {
  load: number;
}

/**
 * Perfil de lotação (soma de pessoas) dentro do intervalo, em trechos
 * contíguos de carga constante (varredura por eventos de início/fim).
 */
export function loadProfile(segments: readonly OccupancySegment[], interval: Interval, capacity: number): LoadPiece[] {
  const events: { at: number; delta: number }[] = [];
  for (const segment of segments) {
    if (!overlaps(segment, interval)) continue;
    const load = segmentLoad(segment, capacity);
    if (load <= 0) continue;
    events.push({ at: Math.max(segment.start, interval.start), delta: load });
    events.push({ at: Math.min(segment.end, interval.end), delta: -load });
  }
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  const pieces: LoadPiece[] = [];
  let load = 0;
  let cursor = interval.start;
  for (const event of events) {
    if (event.at > cursor) {
      pieces.push({ start: cursor, end: event.at, load });
      cursor = event.at;
    }
    load += event.delta;
  }
  if (cursor < interval.end) pieces.push({ start: cursor, end: interval.end, load });
  return pieces;
}

/** Maior soma de pessoas simultâneas no intervalo (preparação conta; bloqueio = área cheia). */
export function peakLoad(segments: readonly OccupancySegment[], interval: Interval, capacity: number): number {
  return loadProfile(segments, interval, capacity).reduce((max, piece) => Math.max(max, piece.load), 0);
}

/** Pessoas na área num instante. */
export function loadAt(segments: readonly OccupancySegment[], atMs: number, capacity: number): number {
  return segments.reduce((sum, s) => (containsInstant(s, atMs) ? sum + segmentLoad(s, capacity) : sum), 0);
}

/**
 * Conflitos para ocupar a mesa no intervalo com `partySize` pessoas.
 * Mesa comum: qualquer sobreposição. Mesa compartilhada: só quando, em algum
 * instante, a soma das pessoas + o novo grupo passa da capacidade; os
 * conflitos devolvidos são os segmentos presentes nos trechos lotados.
 */
export function tableConflicts(
  table: Pick<Table, 'capacity' | 'shared'>,
  segments: readonly OccupancySegment[],
  interval: Interval,
  partySize: number,
): ConflictInfo[] {
  if (!isSharedTable(table)) return findConflicts(segments, interval);
  const full = loadProfile(segments, interval, table.capacity).filter((p) => p.load + partySize > table.capacity);
  if (!full.length) return [];
  return segments.filter((s) => full.some((piece) => overlaps(s, piece))).map(toConflictInfo);
}

/**
 * Reservas envolvidas em trechos em que a área passa da capacidade, a partir
 * de `fromMs` (bloqueios são ignorados: aqui interessa só quem já reservou).
 */
export function overloadedReservationIds(
  segments: readonly OccupancySegment[],
  capacity: number,
  fromMs: number,
): string[] {
  const own = segments.filter((s) => s.kind !== 'block' && s.end > fromMs);
  if (!own.length) return [];
  const end = Math.max(...own.map((s) => s.end));
  const over = loadProfile(own, { start: fromMs, end }, capacity).filter((p) => p.load > capacity);
  const ids = new Set<string>();
  for (const s of own) if (s.reservationId && over.some((p) => overlaps(s, p))) ids.add(s.reservationId);
  return [...ids];
}

export interface AreaLoad {
  tableId: string;
  capacity: number;
  /** Pessoas ocupando lugares no instante (presentes + previstas + preparação). */
  load: number;
  /** Clientes presentes (status seated) no instante. */
  seated: Reservation[];
  /** Reservas confirmadas cujo atendimento previsto cobre o instante. */
  reserved: Reservation[];
  /** Reservas concluídas com preparação em andamento no instante. */
  prep: Reservation[];
  /** Bloqueio que cobre o instante (área fechada). */
  block?: TableBlock;
  inactive: boolean;
}

/** Lotação de uma área (mesa compartilhada) num instante, atual ou previsto. */
export function getAreaLoad(table: Table, data: OccupancyData, atMs: number, nowMs: number): AreaLoad {
  const segments = segmentsForTable(data, table.id, nowMs).filter((s) => containsInstant(s, atMs));
  const byId = (id?: string) => data.reservations.find((r) => r.id === id);
  const pick = (predicate: (s: OccupancySegment, r?: Reservation) => boolean) =>
    segments.filter((s) => predicate(s, byId(s.reservationId))).map((s) => byId(s.reservationId) as Reservation);
  const blockSeg = segments.find((s) => s.kind === 'block');
  return {
    tableId: table.id,
    capacity: table.capacity,
    load: Math.min(
      blockSeg ? table.capacity : Number.POSITIVE_INFINITY,
      segments.reduce((sum, s) => sum + segmentLoad(s, table.capacity), 0),
    ),
    // Cliente presente além do previsto: a projeção termina "agora", mas ele continua sentado.
    seated: pick((s, r) => r?.status === 'seated' && (s.kind === 'service' || atMs <= nowMs)),
    reserved: pick((s, r) => s.kind === 'service' && r?.status === 'confirmed'),
    prep: pick((s, r) => s.kind === 'prep' && !(r?.status === 'seated' && atMs <= nowMs)),
    block: blockSeg ? data.blocks.find((b) => b.id === blockSeg.blockId) : undefined,
    inactive: !table.active,
  };
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
