import type { Interval } from './types';

/**
 * Intervalos semiabertos [início, fim).
 * Há conflito quando inícioA < fimB e inícioB < fimA; portanto um intervalo
 * que termina exatamente quando o outro começa NÃO conflita.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function isValidInterval(interval: Interval): boolean {
  return Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.start < interval.end;
}

export function containsInstant(interval: Interval, instant: number): boolean {
  return interval.start <= instant && instant < interval.end;
}

export function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return start < end ? { start, end } : null;
}

/** Une intervalos sobrepostos ou encostados, devolvendo lista ordenada e disjunta. */
export function mergeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list.filter(isValidInterval).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last && item.start <= last.end) {
      last.end = Math.max(last.end, item.end);
    } else {
      merged.push({ start: item.start, end: item.end });
    }
  }
  return merged;
}

/** Duração total sem contar duas vezes os trechos sobrepostos. */
export function totalDuration(list: readonly Interval[]): number {
  return mergeIntervals(list).reduce((sum, i) => sum + (i.end - i.start), 0);
}

/** Interseção entre duas listas (cada uma é normalizada antes). */
export function intersectLists(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const left = mergeIntervals(a);
  const right = mergeIntervals(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const piece = intersect(left[i], right[j]);
    if (piece) out.push(piece);
    if (left[i].end < right[j].end) i += 1;
    else j += 1;
  }
  return out;
}

/** Remove de `base` todos os trechos cobertos por `remove`. */
export function subtractIntervals(base: readonly Interval[], remove: readonly Interval[]): Interval[] {
  const cuts = mergeIntervals(remove);
  let pieces = mergeIntervals(base);
  for (const cut of cuts) {
    const next: Interval[] = [];
    for (const piece of pieces) {
      if (!overlaps(piece, cut)) {
        next.push(piece);
        continue;
      }
      if (piece.start < cut.start) next.push({ start: piece.start, end: cut.start });
      if (cut.end < piece.end) next.push({ start: cut.end, end: piece.end });
    }
    pieces = next;
  }
  return pieces;
}
