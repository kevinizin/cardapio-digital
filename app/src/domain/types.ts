/**
 * Tipos do domínio de reservas. Datas locais do restaurante são sempre
 * interpretadas em Europe/Paris; instantes são armazenados em ISO (UTC).
 */

/** Data local de Paris no formato AAAA-MM-DD. */
export type LocalDate = string;
/** Horário local de Paris no formato HH:mm (24 horas). */
export type LocalTime = string;
/** Instante absoluto em ISO 8601 (UTC), ex.: 2026-09-15T17:00:00.000Z. */
export type IsoInstant = string;
/** Mês no formato AAAA-MM. */
export type MonthKey = string;

export type Area = 'salao' | 'varanda';

export interface Table {
  id: string;
  capacity: number;
  area: Area;
  active: boolean;
  /**
   * Mesa compartilhada (área controlada por lugares): `capacity` é o máximo de
   * pessoas ao mesmo tempo e várias reservas podem se sobrepor enquanto a soma
   * de pessoas couber. Ausente/false = mesa comum (uma reserva por vez).
   */
  shared?: boolean;
}

/** Registro de ativação/desativação de mesa, usado nos cálculos históricos. */
export interface TableEvent {
  tableId: string;
  active: boolean;
  at: IsoInstant;
}

export type ShiftKind = 'lunch' | 'dinner';
export const SHIFT_KINDS: readonly ShiftKind[] = ['lunch', 'dinner'];

export interface ShiftConfig {
  enabled: boolean;
  start: LocalTime;
  end: LocalTime;
}

export interface DayRule {
  lunch: ShiftConfig;
  dinner: ShiftConfig;
}

/** Semana de funcionamento: índice 0 = segunda-feira … 6 = domingo. */
export type WeeklyRules = DayRule[];

/** Versão da grade semanal válida a partir de uma data (preserva o histórico). */
export interface WeeklyVersion {
  effectiveFrom: LocalDate;
  weekly: WeeklyRules;
}

export interface DateException {
  id: string;
  date: LocalDate;
  closed: boolean;
  lunch: ShiftConfig;
  dinner: ShiftConfig;
  /** Observação interna (administração, em português); nunca exibida ao cliente. */
  note: string;
  /** Aviso opcional aos clientes, por idioma do site público. */
  publicMessage?: PublicMessage;
}

/** Texto exibido ao cliente em cada idioma do site (vazio/ausente = sem mensagem). */
export interface PublicMessage {
  fr?: string;
  pt?: string;
  en?: string;
}

export interface BookingRules {
  serviceMinutes: number;
  prepMinutes: number;
  slotIntervalMinutes: number;
  minAdvanceMinutes: number;
  bookingWindowDays: number;
  arrivalToleranceMinutes: number;
  customerCancelMinutes: number;
  onlineMaxPartySize: number;
  /** Telefone obrigatório nas reservas online (ausente = opcional). */
  phoneRequired?: boolean;
}

export interface Settings {
  weeklyVersions: WeeklyVersion[];
  exceptions: DateException[];
  rules: BookingRules;
}

export type ReservationStatus = 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
export const RESERVATION_STATUSES: readonly ReservationStatus[] = [
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show',
];

export type ReservationSource = 'online' | 'phone' | 'walk_in';
export const RESERVATION_SOURCES: readonly ReservationSource[] = ['online', 'phone', 'walk_in'];

export type Actor = 'customer' | 'admin' | 'system';

export type HistoryKind =
  | 'created'
  | 'updated'
  | 'table_changed'
  | 'arrived'
  | 'completed'
  | 'prep_ended'
  | 'prep_extended'
  | 'cancelled'
  | 'no_show';

export type ChangeField =
  | 'date'
  | 'time'
  | 'partySize'
  | 'tableId'
  | 'serviceMinutes'
  | 'prepMinutes'
  | 'name'
  | 'email'
  | 'phone'
  | 'notes'
  | 'source';

export interface FieldChange {
  field: ChangeField;
  from: string;
  to: string;
}

export interface HistoryEntry {
  at: IsoInstant;
  kind: HistoryKind;
  actor: Actor;
  /** Justificativa informada (cancelamento, extensão de preparação). */
  reason?: string;
  /** Alterações de campos (edição, troca de mesa). */
  changes?: FieldChange[];
  /** Minutos relevantes: antecedência/atraso da chegada, extensão etc. */
  minutes?: number;
}

export interface Customer {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

export interface Reservation {
  id: string;
  code: string;
  tableId: string;
  partySize: number;
  startAt: IsoInstant;
  /** Duração do atendimento aplicada quando a reserva foi criada/editada. */
  serviceMinutes: number;
  /** Preparação aplicada quando a reserva foi criada/editada. */
  prepMinutes: number;
  customer: Customer;
  source: ReservationSource;
  status: ReservationStatus;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  seatedAt: IsoInstant | null;
  completedAt: IsoInstant | null;
  prepEndedAt: IsoInstant | null;
  prepExtensionMinutes: number;
  cancelledAt: IsoInstant | null;
  cancelledBy: Actor | null;
  cancelReason: string | null;
  noShowAt: IsoInstant | null;
  history: HistoryEntry[];
}

export interface TableBlock {
  id: string;
  tableId: string;
  startAt: IsoInstant;
  endAt: IsoInstant;
  reason: string;
  createdAt: IsoInstant;
}

export const SCHEMA_VERSION = 1 as const;

export interface DemoData {
  schemaVersion: typeof SCHEMA_VERSION;
  seededAt: IsoInstant;
  revision: number;
  settings: Settings;
  tables: Table[];
  tableEvents: TableEvent[];
  reservations: Reservation[];
  blocks: TableBlock[];
}

/** Intervalo semiaberto [start, end) em milissegundos desde a época. */
export interface Interval {
  start: number;
  end: number;
}
