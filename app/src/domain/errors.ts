/**
 * Resultados e erros do domínio. As regras devolvem códigos, nunca textos:
 * as mensagens ficam no dicionário de idioma da interface.
 */

export type DomainErrorCode =
  // Grupo e capacidade
  | 'PARTY_SIZE_INVALID'
  | 'PARTY_ABOVE_ONLINE_LIMIT'
  | 'PARTY_ABOVE_CAPACITY'
  // Data e horário
  | 'DATE_INVALID'
  | 'TIME_INVALID'
  | 'TIME_NONEXISTENT'
  | 'DAY_PAST'
  | 'DAY_CLOSED'
  | 'BEYOND_WINDOW'
  | 'START_IN_PAST'
  | 'MIN_ADVANCE'
  | 'OFF_GRID'
  | 'OUTSIDE_SHIFT'
  // Durações
  | 'SERVICE_DURATION_INVALID'
  | 'PREP_DURATION_INVALID'
  // Mesas
  | 'TABLE_NOT_FOUND'
  | 'TABLE_INACTIVE'
  | 'TABLE_TOO_SMALL'
  | 'CONFLICT'
  | 'NO_TABLE_AVAILABLE'
  | 'SLOT_UNAVAILABLE'
  // Cliente
  | 'NAME_REQUIRED'
  | 'NAME_TOO_SHORT'
  | 'NAME_TOO_LONG'
  | 'EMAIL_REQUIRED'
  | 'EMAIL_INVALID'
  | 'EMAIL_TOO_LONG'
  | 'PHONE_INVALID'
  | 'PHONE_TOO_LONG'
  | 'NOTES_TOO_LONG'
  | 'SOURCE_INVALID'
  // Ciclo da reserva
  | 'NOT_FOUND'
  | 'NOT_EDITABLE'
  | 'STATUS_NOT_ALLOWED'
  | 'ALREADY_CANCELLED'
  | 'CANCEL_DEADLINE_PASSED'
  | 'NO_SHOW_TOO_EARLY'
  | 'ARRIVAL_TOO_EARLY'
  | 'ARRIVAL_WINDOW_ENDED'
  | 'TABLE_BUSY_NOW'
  | 'PREP_NOT_ACTIVE'
  | 'EXTENSION_INVALID'
  | 'REASON_REQUIRED'
  | 'REASON_TOO_LONG'
  // Bloqueios
  | 'BLOCK_NOT_FOUND'
  | 'BLOCK_RANGE_INVALID'
  | 'BLOCK_IN_PAST'
  | 'BLOCK_TOO_LONG'
  | 'BLOCK_ALREADY_ENDED'
  // Configurações
  | 'RULE_OUT_OF_RANGE'
  | 'SHIFT_TIME_INVALID'
  | 'SHIFT_ORDER_INVALID'
  | 'SHIFTS_OVERLAP'
  | 'EXCEPTION_DATE_INVALID'
  | 'EXCEPTION_DATE_PAST'
  | 'EXCEPTION_DUPLICATE'
  | 'EXCEPTION_NOTE_TOO_LONG'
  | 'SCHEDULE_CONFLICTS'
  | 'CAPACITY_INVALID'
  | 'TABLE_CHANGE_CONFLICTS'
  | 'ONLINE_LIMIT_ABOVE_CAPACITY'
  | 'NO_ACTIVE_TABLES'
  // Persistência
  | 'PERSISTENCE_BLOCKED'
  // Servidor
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'SAVE_REJECTED';

export type DomainWarningCode =
  | 'EARLY_ARRIVAL'
  | 'LATE_ARRIVAL'
  | 'PREP_OVERLAPS_NEXT'
  | 'SHIFT_TOO_SHORT'
  | 'SAVED_IN_MEMORY_ONLY';

export interface ConflictInfo {
  kind: 'reservation' | 'block';
  id: string;
  tableId: string;
  segment: 'service' | 'prep' | 'block';
  start: number;
  end: number;
}

export type ErrorParams = Record<string, string | number>;

export interface DomainError {
  code: DomainErrorCode;
  field?: string;
  params?: ErrorParams;
  conflicts?: ConflictInfo[];
  reservationIds?: string[];
}

export interface DomainWarning {
  code: DomainWarningCode;
  params?: ErrorParams;
  reservationIds?: string[];
}

export type Result<T> =
  | { ok: true; value: T; warnings: DomainWarning[] }
  | { ok: false; errors: DomainError[] };

export function ok<T>(value: T, warnings: DomainWarning[] = []): Result<T> {
  return { ok: true, value, warnings };
}

export function fail<T = never>(...errors: DomainError[]): Result<T> {
  return { ok: false, errors };
}

export function err(code: DomainErrorCode, extra: Omit<DomainError, 'code'> = {}): DomainError {
  return { code, ...extra };
}
