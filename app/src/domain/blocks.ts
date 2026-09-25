import { LIMITS } from './defaults';
import { err, fail, ok, type DomainError, type Result } from './errors';
import { cryptoRandom, generateId, type RandomSource } from './ids';
import { findConflicts, segmentsForTable, tableParams } from './occupancy';
import { isValidLocalDate, isValidLocalTime, localToMs, MINUTE_MS, toIso, toMs } from './time';
import type { DemoData, LocalDate, LocalTime, TableBlock } from './types';

export interface BlockDraft {
  tableId: string;
  startDate: LocalDate;
  startTime: LocalTime;
  endDate: LocalDate;
  endTime: LocalTime;
  reason: string;
}

/** Tolerância para aceitar um bloqueio que começa "agora". */
const NOW_TOLERANCE_MS = MINUTE_MS;

export function validateBlock(
  data: DemoData,
  draft: BlockDraft,
  nowMs: number,
): Result<{ startMs: number; endMs: number; tableId: string; reason: string }> {
  const errors: DomainError[] = [];
  const table = data.tables.find((t) => t.id === draft.tableId);
  if (!table) errors.push(err('TABLE_NOT_FOUND', { field: 'tableId' }));
  if (!isValidLocalDate(draft.startDate)) errors.push(err('DATE_INVALID', { field: 'startDate' }));
  if (!isValidLocalTime(draft.startTime)) errors.push(err('TIME_INVALID', { field: 'startTime' }));
  if (!isValidLocalDate(draft.endDate)) errors.push(err('DATE_INVALID', { field: 'endDate' }));
  if (!isValidLocalTime(draft.endTime)) errors.push(err('TIME_INVALID', { field: 'endTime' }));
  const reason = draft.reason.trim();
  if (reason.length < LIMITS.blockReasonLength.min) {
    errors.push(err('REASON_REQUIRED', { field: 'reason', params: { min: LIMITS.blockReasonLength.min } }));
  } else if (reason.length > LIMITS.blockReasonLength.max) {
    errors.push(err('REASON_TOO_LONG', { field: 'reason', params: { max: LIMITS.blockReasonLength.max } }));
  }
  if (errors.length) return fail(...errors);

  const startMs = localToMs(draft.startDate, draft.startTime);
  const endMs = localToMs(draft.endDate, draft.endTime);
  if (startMs === null) return fail(err('TIME_NONEXISTENT', { field: 'startTime' }));
  if (endMs === null) return fail(err('TIME_NONEXISTENT', { field: 'endTime' }));
  if (endMs <= startMs) return fail(err('BLOCK_RANGE_INVALID', { field: 'endTime' }));
  if (startMs < nowMs - NOW_TOLERANCE_MS) return fail(err('BLOCK_IN_PAST', { field: 'startTime' }));
  if (endMs - startMs > LIMITS.blockMaxDays * 24 * 60 * MINUTE_MS) {
    return fail(err('BLOCK_TOO_LONG', { field: 'endDate', params: { days: LIMITS.blockMaxDays } }));
  }

  const conflicts = findConflicts(segmentsForTable(data, draft.tableId, nowMs, { relevantFrom: startMs }), {
    start: startMs,
    end: endMs,
  });
  if (conflicts.length) return fail(err('CONFLICT', { field: 'tableId', conflicts, params: tableParams(table, draft.tableId) }));
  return ok({ startMs, endMs, tableId: draft.tableId, reason });
}

export function createBlock(
  data: DemoData,
  draft: BlockDraft,
  nowMs: number,
  random: RandomSource = cryptoRandom,
): Result<{ data: DemoData; block: TableBlock }> {
  const validated = validateBlock(data, draft, nowMs);
  if (!validated.ok) return validated;
  const block: TableBlock = {
    id: generateId('blk', random),
    tableId: validated.value.tableId,
    startAt: toIso(Math.max(validated.value.startMs, nowMs - NOW_TOLERANCE_MS)),
    endAt: toIso(validated.value.endMs),
    reason: validated.value.reason,
    createdAt: toIso(nowMs),
  };
  return ok({ data: { ...data, blocks: [...data.blocks, block] }, block });
}

/**
 * Bloqueio futuro é removido; bloqueio em andamento é encerrado agora.
 * Bloqueios já terminados ficam no histórico (entram no cálculo de ocupação).
 */
export function releaseBlock(
  data: DemoData,
  blockId: string,
  nowMs: number,
): Result<{ data: DemoData; outcome: 'removed' | 'ended' }> {
  const block = data.blocks.find((b) => b.id === blockId);
  if (!block) return fail(err('BLOCK_NOT_FOUND'));
  const start = toMs(block.startAt);
  const end = toMs(block.endAt);
  if (end <= nowMs) return fail(err('BLOCK_ALREADY_ENDED'));
  if (start >= nowMs) {
    return ok({ data: { ...data, blocks: data.blocks.filter((b) => b.id !== blockId) }, outcome: 'removed' });
  }
  const ended: TableBlock = { ...block, endAt: toIso(nowMs) };
  return ok({ data: { ...data, blocks: data.blocks.map((b) => (b.id === blockId ? ended : b)) }, outcome: 'ended' });
}
