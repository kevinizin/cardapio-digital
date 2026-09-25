import type { BookingRules, DayRule, Settings, ShiftConfig, Table, WeeklyRules } from './types';

/** Limites validados pelas regras e pelas configurações. */
export const LIMITS = {
  serviceMinutes: { min: 30, max: 300, step: 5 },
  prepMinutes: { min: 0, max: 120, step: 5 },
  slotIntervalOptions: [5, 10, 15, 20, 30, 60] as readonly number[],
  minAdvanceMinutes: { min: 0, max: 1440, step: 5 },
  bookingWindowDays: { min: 1, max: 365, step: 1 },
  arrivalToleranceMinutes: { min: 0, max: 120, step: 5 },
  customerCancelMinutes: { min: 0, max: 10_080, step: 15 },
  onlineMaxPartySize: { min: 1, max: 12, step: 1 },
  tableCapacity: { min: 1, max: 12, step: 1 },
  nameLength: { min: 2, max: 80 },
  emailMaxLength: 120,
  phoneMaxLength: 30,
  notesMaxLength: 300,
  reasonLength: { min: 3, max: 200 },
  blockReasonLength: { min: 3, max: 120 },
  exceptionNoteMaxLength: 120,
  prepExtension: { min: 5, max: 60, step: 5 },
  blockMaxDays: 14,
  /** Chegada pode ser registrada no máximo com esta antecedência. */
  earlyArrivalMaxMinutes: 180,
  /** A partir desta antecedência a chegada é tratada como muito antecipada. */
  earlyArrivalWarnMinutes: 15,
  /** Janela para a mesa aparecer como "reservada" antes do início. */
  reservedLookaheadMinutes: 60,
  /** Alerta quando a mesa pode não liberar até este tempo antes da próxima reserva. */
  nextReservationAlertMinutes: 15,
} as const;

export const DEFAULT_RULES: BookingRules = {
  serviceMinutes: 90,
  prepMinutes: 20,
  slotIntervalMinutes: 15,
  minAdvanceMinutes: 30,
  bookingWindowDays: 60,
  arrivalToleranceMinutes: 15,
  customerCancelMinutes: 120,
  onlineMaxPartySize: 6,
};

const shift = (enabled: boolean, start: string, end: string): ShiftConfig => ({ enabled, start, end });

export function defaultDayRule(open: boolean): DayRule {
  return { lunch: shift(open, '12:00', '15:00'), dinner: shift(open, '19:00', '23:00') };
}

/** Terça a domingo: almoço 12h–15h e jantar 19h–23h; segunda fechado. */
export function defaultWeekly(): WeeklyRules {
  return [false, true, true, true, true, true, true].map((open) => defaultDayRule(open));
}

/** M01–M04 para 2, M05–M10 para 4, M11–M12 para 6 (44 lugares). M01–M08 no salão; M09–M12 na varanda coberta. */
export function defaultTables(): Table[] {
  return Array.from({ length: 12 }, (_, index) => {
    const n = index + 1;
    const id = `M${String(n).padStart(2, '0')}`;
    const capacity = n <= 4 ? 2 : n <= 10 ? 4 : 6;
    return { id, capacity, area: n <= 8 ? 'salao' : 'varanda', active: true } satisfies Table;
  });
}

export function defaultSettings(effectiveFrom = '2000-01-01'): Settings {
  return {
    weeklyVersions: [{ effectiveFrom, weekly: defaultWeekly() }],
    exceptions: [],
    rules: { ...DEFAULT_RULES },
  };
}
