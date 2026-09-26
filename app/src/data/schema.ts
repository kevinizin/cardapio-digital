import { z } from 'zod';
import { CUSTOMER_LOCALES, RESERVATION_SOURCES, RESERVATION_STATUSES, SCHEMA_VERSION } from '../domain/types';
import type { DemoData } from '../domain/types';

/** Validação dos dados carregados do navegador, antes de qualquer uso. */

const isoInstant = z.string().refine((value) => value.includes('T') && !Number.isNaN(Date.parse(value)), {
  message: 'instante ISO inválido',
});
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const count = z.number().int().nonnegative();

const shiftConfig = z.object({ enabled: z.boolean(), start: localTime, end: localTime });
const dayRule = z.object({ lunch: shiftConfig, dinner: shiftConfig });

const settingsSchema = z.object({
  weeklyVersions: z.array(z.object({ effectiveFrom: localDate, weekly: z.array(dayRule).length(7) })).min(1),
  exceptions: z.array(
    z.object({ id: z.string().min(1), date: localDate, closed: z.boolean(), lunch: shiftConfig, dinner: shiftConfig, note: z.string(), publicMessage: z.object({ fr: z.string().optional(), pt: z.string().optional(), en: z.string().optional() }).optional() }),
  ),
  rules: z.object({
    serviceMinutes: count,
    prepMinutes: count,
    slotIntervalMinutes: z.number().int().positive(),
    minAdvanceMinutes: count,
    bookingWindowDays: count,
    arrivalToleranceMinutes: count,
    customerCancelMinutes: count,
    onlineMaxPartySize: z.number().int().positive(),
    phoneRequired: z.boolean().optional(),
  }),
});

const actor = z.enum(['customer', 'admin', 'system']);

const historyEntry = z.object({
  at: isoInstant,
  kind: z.enum(['created', 'updated', 'table_changed', 'arrived', 'completed', 'prep_ended', 'prep_extended', 'cancelled', 'no_show']),
  actor,
  reason: z.string().optional(),
  minutes: z.number().optional(),
  changes: z
    .array(
      z.object({
        field: z.enum(['date', 'time', 'partySize', 'tableId', 'serviceMinutes', 'prepMinutes', 'name', 'email', 'phone', 'notes', 'source']),
        from: z.string(),
        to: z.string(),
      }),
    )
    .optional(),
});

const reservationSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  tableId: z.string().min(1),
  partySize: z.number().int().positive(),
  startAt: isoInstant,
  serviceMinutes: z.number().int().positive(),
  prepMinutes: count,
  customer: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    notes: z.string(),
    // Campos opcionais: dados antigos continuam válidos (schemaVersion 1).
    marketingOptIn: z.boolean().optional(),
    marketingOptInAt: isoInstant.optional(),
  }),
  source: z.enum(RESERVATION_SOURCES as [string, ...string[]]),
  status: z.enum(RESERVATION_STATUSES as [string, ...string[]]),
  createdAt: isoInstant,
  updatedAt: isoInstant,
  seatedAt: isoInstant.nullable(),
  completedAt: isoInstant.nullable(),
  prepEndedAt: isoInstant.nullable(),
  prepExtensionMinutes: count,
  cancelledAt: isoInstant.nullable(),
  cancelledBy: actor.nullable(),
  cancelReason: z.string().nullable(),
  noShowAt: isoInstant.nullable(),
  history: z.array(historyEntry),
  locale: z.enum(CUSTOMER_LOCALES as [string, ...string[]]).optional(),
});

export const demoDataSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    seededAt: isoInstant,
    revision: count,
    settings: settingsSchema,
    tables: z
      .array(z.object({ id: z.string().min(1), capacity: z.number().int().positive(), area: z.enum(['salao', 'varanda']), active: z.boolean(), shared: z.boolean().optional() }))
      .min(1),
    tableEvents: z.array(z.object({ tableId: z.string().min(1), active: z.boolean(), at: isoInstant })),
    reservations: z.array(reservationSchema),
    blocks: z.array(
      z.object({ id: z.string().min(1), tableId: z.string().min(1), startAt: isoInstant, endAt: isoInstant, reason: z.string(), createdAt: isoInstant }),
    ),
  })
  .superRefine((data, ctx) => {
    const tableIds = new Set(data.tables.map((t) => t.id));
    if (tableIds.size !== data.tables.length) ctx.addIssue({ code: 'custom', message: 'mesas duplicadas', path: ['tables'] });
    const ids = new Set<string>();
    const codes = new Set<string>();
    data.reservations.forEach((r, index) => {
      if (!tableIds.has(r.tableId)) ctx.addIssue({ code: 'custom', message: 'reserva com mesa inexistente', path: ['reservations', index, 'tableId'] });
      if (ids.has(r.id) || codes.has(r.code)) ctx.addIssue({ code: 'custom', message: 'reserva duplicada', path: ['reservations', index] });
      ids.add(r.id);
      codes.add(r.code);
    });
    data.blocks.forEach((b, index) => {
      if (!tableIds.has(b.tableId)) ctx.addIssue({ code: 'custom', message: 'bloqueio com mesa inexistente', path: ['blocks', index] });
      if (Date.parse(b.endAt) <= Date.parse(b.startAt)) ctx.addIssue({ code: 'custom', message: 'bloqueio com período inválido', path: ['blocks', index] });
    });
  });

export type ValidationOutcome = { ok: true; data: DemoData } | { ok: false; detail: string };

export function validateDemoData(value: unknown): ValidationOutcome {
  const parsed = demoDataSchema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data as DemoData };
  const first = parsed.error.issues[0];
  return { ok: false, detail: first ? `${first.path.join('.') || 'raiz'}: ${first.message}` : 'formato inválido' };
}
