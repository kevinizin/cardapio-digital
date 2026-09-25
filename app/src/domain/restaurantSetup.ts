import { DEFAULT_RULES } from './defaults';
import type { DayRule, Settings, Table, WeeklyRules } from './types';

/**
 * Configuração inicial do Aromas da Vivi (usada só na primeira
 * inicialização do banco; depois tudo se ajusta em Configurações).
 *
 * Terça a domingo, serviço contínuo das 12h às 22h; segunda fechado.
 * O serviço contínuo usa o primeiro turno do dia; o segundo fica desligado.
 * Com 1h30 de atendimento + 20 min de preparação, a última reserva é às 20h.
 */
function day(open: boolean): DayRule {
  return {
    lunch: { enabled: open, start: '12:00', end: '22:00' },
    dinner: { enabled: false, start: '19:00', end: '22:00' },
  };
}

export function restaurantWeekly(): WeeklyRules {
  return [false, true, true, true, true, true, true].map(day);
}

export function restaurantSettings(effectiveFrom: string): Settings {
  return {
    weeklyVersions: [{ effectiveFrom, weekly: restaurantWeekly() }],
    exceptions: [],
    rules: { ...DEFAULT_RULES },
  };
}

/**
 * Capacidade informada: 35 lugares no salão e 10 no terraço.
 * PROVISÓRIO até a lista real de mesas: salão 6×4 + 5×2 + 1×1 (35),
 * terraço 2×4 + 1×2 (10).
 */
export function restaurantTables(): Table[] {
  const inside = [4, 4, 4, 4, 4, 4, 2, 2, 2, 2, 2, 1];
  const terrace = [4, 4, 2];
  return [
    ...inside.map((capacity, i) => ({ id: `M${String(i + 1).padStart(2, '0')}`, capacity, area: 'salao' as const, active: true })),
    ...terrace.map((capacity, i) => ({ id: `T${i + 1}`, capacity, area: 'varanda' as const, active: true })),
  ];
}
