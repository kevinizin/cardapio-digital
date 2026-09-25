import { defaultSettings, defaultTables } from '../defaults';
import { localToMs, toIso } from '../time';
import { SCHEMA_VERSION } from '../types';
import type { Customer, DemoData, Reservation, TableBlock } from '../types';

/** Instante (ms) de uma data/hora local de Paris. */
export function at(date: string, time: string): number {
  const ms = localToMs(date, time);
  if (ms === null) throw new Error(`Horário inválido em teste: ${date} ${time}`);
  return ms;
}

export function iso(date: string, time: string): string {
  return toIso(at(date, time));
}

export function baseData(overrides: Partial<DemoData> = {}): DemoData {
  return {
    schemaVersion: SCHEMA_VERSION,
    seededAt: '2026-01-01T00:00:00.000Z',
    revision: 1,
    settings: defaultSettings('2020-01-01'),
    tables: defaultTables(),
    tableEvents: [],
    reservations: [],
    blocks: [],
    ...overrides,
  };
}

export const customer: Customer = { name: 'Ana Teste', email: 'ana.teste@example.com', phone: '', notes: '' };

let counter = 0;

export function makeReservation(partial: Partial<Reservation> & { startAt: string; tableId: string }): Reservation {
  counter += 1;
  return {
    id: `res_test${counter}`,
    code: `TST${String(counter).padStart(1, '0')}`,
    partySize: 2,
    serviceMinutes: 90,
    prepMinutes: 20,
    customer: { ...customer },
    source: 'online',
    status: 'confirmed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    seatedAt: null,
    completedAt: null,
    prepEndedAt: null,
    prepExtensionMinutes: 0,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    noShowAt: null,
    history: [],
    ...partial,
  };
}

export function makeBlock(partial: Partial<TableBlock> & { tableId: string; startAt: string; endAt: string }): TableBlock {
  counter += 1;
  return { id: `blk_test${counter}`, reason: 'Teste de bloqueio', createdAt: '2026-01-01T00:00:00.000Z', ...partial };
}
