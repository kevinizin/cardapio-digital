import { candidateTables } from './availability';
import { defaultSettings, defaultTables } from './defaults';
import { createSeededRandom, generateId, generateReservationCode, type RandomSource } from './ids';
import { overlaps } from './intervals';
import { getShiftsForDate, slotStartsForShift, type ResolvedShift } from './schedule';
import {
  addDays,
  addMonths,
  diffInDays,
  firstDayOfMonth,
  localToMs,
  MINUTE_MS,
  parisDate,
  parisMonth,
  parisTime,
  timeToMinutes,
  toIso,
  toMs,
  weekdayIndex,
} from './time';
import { SCHEMA_VERSION } from './types';
import type {
  Customer,
  DateException,
  DemoData,
  HistoryEntry,
  Interval,
  LocalDate,
  Reservation,
  ReservationSource,
  Settings,
  Table,
  TableBlock,
} from './types';

/** Semente fixa: a "forma" dos dados é sempre a mesma, relativa à data atual de Paris. */
export const DEMO_SEED = 20260914;

const DAY_MS = 24 * 60 * MINUTE_MS;

// Demanda relativa por dia da semana (0 = segunda … 6 = domingo).
const LUNCH_DEMAND = [0, 0.4, 0.45, 0.5, 0.6, 0.8, 0.85];
const DINNER_DEMAND = [0, 0.5, 0.55, 0.65, 0.9, 1, 0.6];

const FIRST_NAMES = [
  'Camille', 'Louis', 'Inès', 'Hugo', 'Chloé', 'Gabriel', 'Léa', 'Arthur', 'Manon', 'Jules', 'Sofia', 'Rafael',
  'Helena', 'Miguel', 'Alice', 'Théo', 'Beatriz', 'Lucas', 'Clara', 'Nathan', 'Amélie', 'Paul', 'Laura', 'Victor',
  'Julia', 'Mathieu', 'Isabela', 'Antoine', 'Marina', 'Pedro', 'Élodie', 'Bruno', 'Yasmin', 'Olivier', 'Carolina',
  'Samuel',
];
const LAST_NAMES = [
  'Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Lefèvre', 'Garnier', 'Rousseau', 'Fontaine', 'Chevalier',
  'Mercier', 'Blanc', 'Faure', 'Andrade', 'Siqueira', 'Moraes', 'Teixeira', 'Carvalho', 'Lopes', 'Ribeiro', 'Costa',
  'Almeida', 'Nogueira', 'Schneider', 'Rossi', 'Novak',
];
const NOTES = [
  'Aniversário de casamento.',
  'Comemoração de aniversário.',
  'Cadeira alta para criança, se possível.',
  'Chegaremos alguns minutos antes.',
  'Preferimos uma mesa mais tranquila.',
  'Almoço de trabalho.',
  'Primeira visita ao restaurante.',
  'Um convidado pode chegar um pouco depois.',
];
const ADMIN_CANCEL_REASONS = [
  'Cliente avisou por telefone que não poderá comparecer.',
  'Pedido de cancelamento recebido pelo atendimento.',
  'Reserva registrada em duplicidade por engano.',
  'Mudança de planos do grupo, informada pelo cliente.',
];
const EXTENSION_REASONS = ['Troca completa de toalha e arranjo da mesa.', 'Limpeza extra após bebida derramada.'];

interface Skeleton {
  id: string;
  code: string;
  table: Table;
  date: LocalDate;
  shift: ResolvedShift;
  startMs: number;
  partySize: number;
  source: ReservationSource;
  createdMs: number;
  customer: Customer;
}

function createHelpers(random: RandomSource) {
  const between = (min: number, max: number) => min + random() * (max - min);
  const int = (min: number, max: number) => Math.floor(between(min, max + 1));
  const chance = (p: number) => random() < p;
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const weighted = <T>(items: readonly (readonly [T, number])[]): T => {
    const total = items.reduce((sum, [, w]) => sum + w, 0);
    let roll = random() * total;
    for (const [value, weight] of items) {
      roll -= weight;
      if (roll < 0) return value;
    }
    return items[items.length - 1][0];
  };
  return { between, int, chance, pick, weighted };
}

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Primeira data com funcionamento a partir de `from` (sem considerar exceções). */
function nextOpenDate(settings: Settings, from: LocalDate): LocalDate {
  let date = from;
  for (let i = 0; i < 14; i += 1) {
    if (getShiftsForDate(settings, date).length === 2) return date;
    date = addDays(date, 1);
  }
  return from;
}

function shiftOf(settings: Settings, date: LocalDate, kind: 'lunch' | 'dinner'): ResolvedShift | undefined {
  return getShiftsForDate(settings, date).find((s) => s.kind === kind);
}

/**
 * Gera os dados fictícios: três meses completos de histórico antes do mês
 * atual, o mês atual e reservas futuras dentro da janela, sem conflitos.
 */
export function createDemoData(nowMs: number, seed = DEMO_SEED): DemoData {
  const random = createSeededRandom(seed);
  const h = createHelpers(random);
  const today = parisDate(nowMs);
  const historyStart = firstDayOfMonth(addMonths(parisMonth(nowMs), -3));
  const baseSettings = defaultSettings('2020-01-01');
  const { rules } = baseSettings;
  const tables = defaultTables();
  const windowEnd = addDays(today, rules.bookingWindowDays);
  const blockMinutes = rules.serviceMinutes + rules.prepMinutes;
  const codes = new Set<string>();
  const createdIso = (ms: number) => toIso(Math.floor(ms / MINUTE_MS) * MINUTE_MS);

  // Exceções: um fechamento passado, um futuro e um horário especial.
  const exceptionDates = {
    pastClosed: nextOpenDate(baseSettings, addDays(historyStart, 38)),
    futureClosed: nextOpenDate(baseSettings, addDays(today, 18)),
    special: nextOpenDate(baseSettings, addDays(today, 32)),
  };
  const baseShift = (enabled: boolean, start: string, end: string) => ({ enabled, start, end });
  const exceptions: DateException[] = [
    {
      id: generateId('exc', random),
      date: exceptionDates.pastClosed,
      closed: true,
      lunch: baseShift(true, '12:00', '15:00'),
      dinner: baseShift(true, '19:00', '23:00'),
      note: 'Inventário e manutenção da cozinha',
    },
    {
      id: generateId('exc', random),
      date: exceptionDates.futureClosed,
      closed: true,
      lunch: baseShift(true, '12:00', '15:00'),
      dinner: baseShift(true, '19:00', '23:00'),
      note: 'Folga coletiva da equipe',
    },
    {
      id: generateId('exc', random),
      date: exceptionDates.special,
      closed: false,
      lunch: baseShift(false, '12:00', '15:00'),
      dinner: baseShift(true, '18:30', '23:30'),
      note: 'Noite de vinhos da estação: somente jantar, com horário estendido',
    },
  ];
  const settings: Settings = {
    ...baseSettings,
    exceptions: exceptions.filter((e) => e.date <= windowEnd).sort((a, b) => a.date.localeCompare(b.date)),
  };

  // Ocupação usada na geração: por mesa e data, sempre pelo período previsto completo.
  const taken = new Map<string, Interval[]>();
  const key = (tableId: string, date: LocalDate) => `${tableId}|${date}`;
  const isFree = (tableId: string, date: LocalDate, interval: Interval) =>
    !(taken.get(key(tableId, date)) ?? []).some((i) => overlaps(i, interval));
  const occupy = (tableId: string, date: LocalDate, interval: Interval) => {
    const list = taken.get(key(tableId, date));
    if (list) list.push(interval);
    else taken.set(key(tableId, date), [interval]);
  };

  // Bloqueios manuais: dois no histórico, um futuro e, se o horário atual permitir, um em andamento.
  const blocks: TableBlock[] = [];
  const addBlock = (tableId: string, startMs: number, endMs: number, reason: string, createdMs: number) => {
    const date = parisDate(startMs);
    if (!isFree(tableId, date, { start: startMs, end: endMs })) return;
    occupy(tableId, date, { start: startMs, end: endMs });
    blocks.push({ id: generateId('blk', random), tableId, startAt: toIso(startMs), endAt: toIso(endMs), reason, createdAt: createdIso(createdMs) });
  };
  const blockShift = (tableId: string, date: LocalDate, kind: 'lunch' | 'dinner', reason: string) => {
    const shift = shiftOf(settings, date, kind);
    if (shift) addBlock(tableId, shift.startMs, shift.endMs, reason, Math.min(shift.startMs - 3 * DAY_MS, nowMs - DAY_MS));
  };
  blockShift('M12', nextOpenDate(settings, addDays(historyStart, 20)), 'lunch', 'Manutenção do toldo da varanda.');
  blockShift('M03', nextOpenDate(settings, addDays(historyStart, 55)), 'dinner', 'Troca do estofado das cadeiras.');
  blockShift('M09', nextOpenDate(settings, addDays(today, 3)), 'dinner', 'Montagem para evento privado na varanda.');
  const current = getShiftsForDate(settings, today).find((s) => nowMs >= s.startMs && nowMs < s.endMs - 30 * MINUTE_MS);
  if (current) {
    const start = Math.max(current.startMs, Math.floor((nowMs - 40 * MINUTE_MS) / (15 * MINUTE_MS)) * 15 * MINUTE_MS);
    const end = Math.min(current.endMs, Math.ceil((nowMs + 50 * MINUTE_MS) / (15 * MINUTE_MS)) * 15 * MINUTE_MS);
    addBlock('M08', start, end, 'Cadeira danificada, aguardando substituição.', start - 5 * MINUTE_MS);
  }

  // 1ª passada: esqueletos com mesa atribuída (menor mesa livre, desempate por identificação).
  const skeletons: Skeleton[] = [];
  const makeCustomer = (): Customer => {
    const first = h.pick(FIRST_NAMES);
    const last = h.pick(LAST_NAMES);
    return {
      name: `${first} ${last}`,
      email: `${slug(first)}.${slug(last)}${h.int(1, 99)}@example.com`,
      phone: h.chance(0.55) ? `+33 6 39 98 ${pad2(h.int(0, 99))} ${pad2(h.int(0, 99))}` : '',
      notes: h.chance(0.16) ? h.pick(NOTES) : '',
    };
  };
  // Almoço concentrado perto de 12h45; no jantar, procura pelos dois turnos (19h e 21h) e pelo pico das 20h.
  const DINNER_WEIGHTS: Record<string, number> = {
    '19:00': 0.95,
    '19:15': 0.55,
    '19:30': 0.75,
    '19:45': 0.6,
    '20:00': 0.85,
    '20:15': 0.5,
    '20:30': 0.45,
    '20:45': 0.3,
    '21:00': 0.9,
  };
  const popularity = (kind: 'lunch' | 'dinner', startMs: number) => {
    if (kind === 'dinner') return DINNER_WEIGHTS[parisTime(startMs)] ?? 0.4;
    const minutes = timeToMinutes(parisTime(startMs));
    return Math.max(0.2, 1 - Math.abs(minutes - (12 * 60 + 45)) / 90);
  };

  for (let date = historyStart; date <= windowEnd; date = addDays(date, 1)) {
    const shifts = getShiftsForDate(settings, date);
    if (!shifts.length) continue;
    const daysAhead = diffInDays(today, date);
    const mood = random();
    const dayFactor = mood < 0.09 ? 0.35 : mood > 0.9 ? 1.6 : h.between(0.75, 1.1);
    const futureFactor =
      daysAhead <= 0 ? 1 : daysAhead <= 2 ? 0.9 : daysAhead <= 7 ? 0.72 : daysAhead <= 14 ? 0.5 : daysAhead <= 30 ? 0.28 : 0.12;

    for (const shift of shifts) {
      const slots = slotStartsForShift(shift, rules.slotIntervalMinutes, blockMinutes);
      if (!slots.length) continue;
      const perTable = Math.max(1, Math.floor((shift.endMs - shift.startMs) / (blockMinutes * MINUTE_MS)));
      const demand = (shift.kind === 'lunch' ? LUNCH_DEMAND : DINNER_DEMAND)[weekdayIndex(date)] || 0.5;
      const requests = Math.round(tables.length * perTable * demand * dayFactor * futureFactor * h.between(0.95, 1.2));
      const weights = slots.map((s) => [s, popularity(shift.kind, s)] as const);

      for (let i = 0; i < requests; i += 1) {
        const partySize = h.weighted([[1, 4], [2, 44], [3, 12], [4, 24], [5, 6], [6, 10]] as const);
        const preferred = h.weighted(weights);
        const preferredIndex = slots.indexOf(preferred);
        // Aceita horários até 1 hora do preferido, do mais próximo para o mais distante.
        const order = slots
          .map((_, index) => index)
          .filter((index) => Math.abs(index - preferredIndex) <= 4)
          .sort((a, b) => Math.abs(a - preferredIndex) - Math.abs(b - preferredIndex) || b - a);
        const candidates = candidateTables(tables, partySize);
        for (const index of order) {
          const startMs = slots[index];
          const interval = { start: startMs, end: startMs + blockMinutes * MINUTE_MS };
          const table = candidates.find((t) => isFree(t.id, date, interval));
          if (!table) continue;
          occupy(table.id, date, interval);

          const source: ReservationSource =
            startMs <= nowMs && h.chance(0.08) ? 'walk_in' : h.chance(0.32) ? 'phone' : 'online';
          let createdMs: number;
          if (source === 'walk_in') {
            createdMs = startMs - h.int(0, 4) * MINUTE_MS;
          } else {
            const leadDays = h.weighted([[0, 10], [1, 14], [2, 12], [3, 10], [5, 12], [7, 12], [10, 9], [14, 8], [21, 7], [30, 6]] as const);
            const leadMs = leadDays === 0 ? h.int(45, 360) * MINUTE_MS : (leadDays + h.int(0, 2)) * DAY_MS + h.int(0, 600) * MINUTE_MS;
            createdMs = startMs - leadMs;
            const minLead = (source === 'online' ? rules.minAdvanceMinutes + h.int(5, 90) : h.int(10, 90)) * MINUTE_MS;
            createdMs = Math.min(createdMs, startMs - minLead, nowMs - h.int(3, 240) * MINUTE_MS);
          }
          skeletons.push({
            id: generateId('res', random),
            code: generateReservationCode(codes, random),
            table,
            date,
            shift,
            startMs,
            partySize,
            source,
            createdMs,
            customer: makeCustomer(),
          });
          codes.add(skeletons[skeletons.length - 1].code);
          break;
        }
      }
    }
  }

  // Cenário explícito: reserva criada num mês para atendimento no mês seguinte.
  const nextMonth = addMonths(parisMonth(nowMs), 1);
  const crossMonth = skeletons.find((s) => parisMonth(s.startMs) === nextMonth && s.source !== 'walk_in');
  if (crossMonth) {
    const firstOfMonthMs = localToMs(firstDayOfMonth(parisMonth(nowMs)), '10:00') ?? nowMs - DAY_MS;
    crossMonth.createdMs = Math.min(Math.max(firstOfMonthMs, nowMs - 3 * DAY_MS), nowMs - 60 * MINUTE_MS);
  }

  // 2ª passada: situação de cada reserva conforme o horário atual, com tempos reais coerentes.
  const byTableDate = new Map<string, Skeleton[]>();
  for (const s of skeletons) {
    const list = byTableDate.get(key(s.table.id, s.date));
    if (list) list.push(s);
    else byTableDate.set(key(s.table.id, s.date), [s]);
  }
  for (const list of byTableDate.values()) list.sort((a, b) => a.startMs - b.startMs);

  const reservations: Reservation[] = skeletons.map((s) => {
    const siblings = byTableDate.get(key(s.table.id, s.date)) ?? [];
    const next = siblings[siblings.indexOf(s) + 1];
    const nextBlock = blocks
      .filter((b) => b.tableId === s.table.id && toMs(b.startAt) >= s.startMs)
      .map((b) => toMs(b.startAt))
      .sort((a, b) => a - b)[0];
    const nextBusy = Math.min(next?.startMs ?? Infinity, nextBlock ?? Infinity);
    const plannedEnd = s.startMs + rules.serviceMinutes * MINUTE_MS;
    const blockEnd = plannedEnd + rules.prepMinutes * MINUTE_MS;
    const history: HistoryEntry[] = [
      { at: createdIso(s.createdMs), kind: 'created', actor: s.source === 'online' ? 'customer' : 'admin' },
    ];
    const reservation: Reservation = {
      id: s.id,
      code: s.code,
      tableId: s.table.id,
      partySize: s.partySize,
      startAt: toIso(s.startMs),
      serviceMinutes: rules.serviceMinutes,
      prepMinutes: rules.prepMinutes,
      customer: s.customer,
      source: s.source,
      status: 'confirmed',
      createdAt: createdIso(s.createdMs),
      updatedAt: createdIso(s.createdMs),
      seatedAt: null,
      completedAt: null,
      prepEndedAt: null,
      prepExtensionMinutes: 0,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      noShowAt: null,
      history,
    };

    const editMs = s.createdMs + h.int(30, 600) * MINUTE_MS;
    if (s.source !== 'walk_in' && editMs < Math.min(s.startMs - 60 * MINUTE_MS, nowMs) && h.chance(0.07)) {
      if (s.customer.phone) {
        history.push({ at: createdIso(editMs), kind: 'updated', actor: 'admin', changes: [{ field: 'phone', from: '', to: s.customer.phone }] });
      } else if (s.customer.notes) {
        history.push({ at: createdIso(editMs), kind: 'updated', actor: 'admin', changes: [{ field: 'notes', from: '', to: s.customer.notes }] });
      }
    }

    const complete = (seatedMs: number, completedMs: number) => {
      reservation.status = 'completed';
      reservation.seatedAt = createdIso(seatedMs);
      reservation.completedAt = createdIso(completedMs);
      history.push({ at: reservation.seatedAt, kind: 'arrived', actor: 'admin', minutes: Math.round((seatedMs - s.startMs) / MINUTE_MS) });
      history.push({ at: reservation.completedAt, kind: 'completed', actor: 'admin', minutes: rules.prepMinutes });
      const prepEnd = toMs(reservation.completedAt) + rules.prepMinutes * MINUTE_MS;
      if (prepEnd <= nowMs && h.chance(0.05)) {
        const endedMs = toMs(reservation.completedAt) + h.int(8, 15) * MINUTE_MS;
        reservation.prepEndedAt = createdIso(endedMs);
        history.push({ at: reservation.prepEndedAt, kind: 'prep_ended', actor: 'admin', minutes: Math.round((prepEnd - endedMs) / MINUTE_MS) });
      } else if (prepEnd + 10 * MINUTE_MS <= Math.min(nextBusy, nowMs) && h.chance(0.04)) {
        reservation.prepExtensionMinutes = 10;
        history.push({ at: createdIso(prepEnd - 5 * MINUTE_MS), kind: 'prep_extended', actor: 'admin', minutes: 10, reason: h.pick(EXTENSION_REASONS) });
      }
    };

    if (blockEnd <= nowMs) {
      const roll = random();
      if (s.source !== 'walk_in' && roll < 0.1) {
        const byCustomer = s.createdMs < s.startMs - (rules.customerCancelMinutes + 60) * MINUTE_MS && h.chance(0.7);
        const latest = byCustomer ? s.startMs - rules.customerCancelMinutes * MINUTE_MS : s.startMs - 10 * MINUTE_MS;
        const cancelMs = s.createdMs + (latest - s.createdMs) * h.between(0.2, 0.95);
        reservation.status = 'cancelled';
        reservation.cancelledAt = createdIso(Math.max(cancelMs, s.createdMs + MINUTE_MS));
        reservation.cancelledBy = byCustomer ? 'customer' : 'admin';
        reservation.cancelReason = byCustomer ? null : h.pick(ADMIN_CANCEL_REASONS);
        history.push({
          at: reservation.cancelledAt,
          kind: 'cancelled',
          actor: byCustomer ? 'customer' : 'admin',
          ...(byCustomer ? {} : { reason: reservation.cancelReason ?? undefined }),
        });
      } else if (s.source !== 'walk_in' && roll < 0.16) {
        const noShowMs = s.startMs + (rules.arrivalToleranceMinutes + h.int(0, 25)) * MINUTE_MS;
        reservation.status = 'no_show';
        reservation.noShowAt = createdIso(noShowMs);
        history.push({ at: reservation.noShowAt, kind: 'no_show', actor: 'admin' });
      } else {
        const seatedMs = s.source === 'walk_in' ? s.startMs : s.startMs + h.int(0, 12) * MINUTE_MS;
        complete(seatedMs, Math.min(seatedMs + h.int(62, 88) * MINUTE_MS, plannedEnd));
      }
    } else if (s.startMs <= nowMs) {
      const elapsedMin = Math.floor((nowMs - s.startMs) / MINUTE_MS);
      if (nowMs < plannedEnd) {
        if (s.source !== 'walk_in' && elapsedMin >= 1 && elapsedMin < rules.arrivalToleranceMinutes && h.chance(0.35)) {
          // cliente atrasado dentro da tolerância: continua confirmada
        } else if (s.source !== 'walk_in' && elapsedMin >= rules.arrivalToleranceMinutes && h.chance(0.12)) {
          // tolerância excedida: a administração decide se marca ausência
        } else {
          const seatedMs = s.startMs + Math.min(h.int(0, 10), elapsedMin) * MINUTE_MS;
          if (elapsedMin >= 60 && h.chance(0.3)) {
            complete(seatedMs, Math.max(seatedMs + 45 * MINUTE_MS, nowMs - h.int(2, 12) * MINUTE_MS));
          } else {
            reservation.status = 'seated';
            reservation.seatedAt = createdIso(seatedMs);
            history.push({ at: reservation.seatedAt, kind: 'arrived', actor: 'admin', minutes: Math.round((seatedMs - s.startMs) / MINUTE_MS) });
          }
        }
      } else if (nextBusy >= nowMs + 45 * MINUTE_MS && h.chance(0.25)) {
        // atendimento além do previsto, sem próxima reserva próxima nesta mesa
        const seatedMs = s.startMs + h.int(0, 8) * MINUTE_MS;
        reservation.status = 'seated';
        reservation.seatedAt = createdIso(seatedMs);
        history.push({ at: reservation.seatedAt, kind: 'arrived', actor: 'admin', minutes: Math.round((seatedMs - s.startMs) / MINUTE_MS) });
      } else {
        const seatedMs = s.startMs + h.int(0, 8) * MINUTE_MS;
        complete(seatedMs, Math.min(plannedEnd - h.int(0, 10) * MINUTE_MS, nowMs - MINUTE_MS));
      }
    } else if (h.chance(0.07)) {
      const byCustomer = s.createdMs < s.startMs - rules.customerCancelMinutes * MINUTE_MS;
      const limit = Math.min(nowMs - MINUTE_MS, byCustomer ? s.startMs - rules.customerCancelMinutes * MINUTE_MS : nowMs - MINUTE_MS);
      const cancelMs = s.createdMs + Math.max(MINUTE_MS, (limit - s.createdMs) * h.between(0.2, 0.9));
      if (cancelMs < nowMs) {
        reservation.status = 'cancelled';
        reservation.cancelledAt = createdIso(cancelMs);
        reservation.cancelledBy = byCustomer ? 'customer' : 'admin';
        reservation.cancelReason = byCustomer ? null : h.pick(ADMIN_CANCEL_REASONS);
        history.push({
          at: reservation.cancelledAt,
          kind: 'cancelled',
          actor: byCustomer ? 'customer' : 'admin',
          ...(byCustomer ? {} : { reason: reservation.cancelReason ?? undefined }),
        });
      }
    }

    history.sort((a, b) => toMs(a.at) - toMs(b.at));
    reservation.updatedAt = history[history.length - 1].at;
    return reservation;
  });

  reservations.sort((a, b) => toMs(a.startAt) - toMs(b.startAt) || a.tableId.localeCompare(b.tableId));

  return {
    schemaVersion: SCHEMA_VERSION,
    seededAt: toIso(nowMs),
    revision: 1,
    settings,
    tables,
    tableEvents: [],
    reservations,
    blocks: blocks.sort((a, b) => toMs(a.startAt) - toMs(b.startAt)),
  };
}
