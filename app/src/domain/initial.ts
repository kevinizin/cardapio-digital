import { restaurantSettings, restaurantTables } from './restaurantSetup';
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
    settings: restaurantSettings(parisDate(nowMs)),
    tables: restaurantTables(),
    tableEvents: [],
    reservations: [],
    blocks: [],
  };
}
