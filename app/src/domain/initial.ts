import { defaultSettings, defaultTables } from './defaults';
import { parisDate, toIso } from './time';
import { SCHEMA_VERSION, type DemoData } from './types';

/**
 * Dados iniciais do restaurante em produção: configurações e mesas, sem
 * nenhuma reserva. Usado pelo servidor na primeira inicialização do banco.
 */
export function createInitialData(nowMs: number): DemoData {
  return {
    schemaVersion: SCHEMA_VERSION,
    seededAt: toIso(nowMs),
    revision: 1,
    settings: defaultSettings(parisDate(nowMs)),
    tables: defaultTables(),
    tableEvents: [],
    reservations: [],
    blocks: [],
  };
}
