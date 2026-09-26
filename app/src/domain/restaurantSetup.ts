import { DEFAULT_RULES } from './defaults';
import { generateId } from './ids';
import type { DateException, DayRule, Settings, Table, WeeklyRules } from './types';

/**
 * Configuração inicial do Aromas da Vivi (usada só na primeira
 * inicialização do banco; depois tudo se ajusta em Configurações).
 *
 * Terça a domingo, serviço contínuo das 12h às 22h; segunda fechado.
 * O serviço contínuo usa o primeiro turno do dia; o segundo fica desligado.
 * Com 1h30 de atendimento + 10 min de preparação (arrumar a mesa), a última
 * reserva é às 20h15 (o bloco de 1h40 precisa terminar até as 22h).
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

/** Fechamentos já conhecidos na primeira inicialização (as datas passadas ficam de fora). */
export function restaurantClosures(effectiveFrom: string): DateException[] {
  const closed = (date: string, note: string): DateException => ({
    id: generateId('exc'),
    date,
    closed: true,
    lunch: { enabled: false, start: '12:00', end: '22:00' },
    dinner: { enabled: false, start: '19:00', end: '22:00' },
    note,
  });
  return [closed('2026-12-25', 'Natal'), closed('2027-01-01', 'Ano-novo')].filter((e) => e.date >= effectiveFrom);
}

export function restaurantSettings(effectiveFrom: string): Settings {
  return {
    weeklyVersions: [{ effectiveFrom, weekly: restaurantWeekly() }],
    exceptions: restaurantClosures(effectiveFrom),
    // Preparação de 10 min; online até 8 pessoas (grupos maiores: WhatsApp) e com telefone.
    // Antecedência 30 min, janela 60 dias, cancelamento 2 h e tolerância 15 min vêm do padrão.
    rules: { ...DEFAULT_RULES, prepMinutes: 10, onlineMaxPartySize: 8, phoneRequired: true },
  };
}

/**
 * Reservas controladas por lugares, não por mesa: a dona junta e reorganiza as
 * mesas conforme as reservas do dia. Cada área é uma "mesa compartilhada" com
 * o máximo de pessoas ao mesmo tempo (ajustável em Configurações):
 * salão 30 e terraço 10. A ordem define a preferência (salão primeiro).
 */
export function restaurantTables(): Table[] {
  return [
    { id: 'SALAO', capacity: 30, area: 'salao', shared: true, active: true },
    { id: 'TERRACO', capacity: 10, area: 'varanda', shared: true, active: true },
  ];
}
