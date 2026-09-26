import { frenchHolidays, type Holiday } from '../domain/holidays';

/** Feriados de um ano, vindos do servidor (Nager.Date com cache) ou calculados localmente. */
export interface HolidayYear {
  holidays: Holiday[];
  /** 'server' = lista oficial; 'local' = cálculo local (demonstração ou serviço fora do ar). */
  source: 'server' | 'local';
}

const localYear = (year: number): HolidayYear => ({
  holidays: frenchHolidays(year).map(({ date, localName, name }) => ({ date, localName, name })),
  source: 'local',
});

/**
 * Na demonstração, não chama o servidor. Com servidor, uma falha (rede, sessão,
 * serviço externo) cai para o cálculo local, para a tela nunca ficar vazia.
 */
export async function loadHolidayYear(year: number, mode: 'demo' | 'remote'): Promise<HolidayYear> {
  if (mode === 'demo') return localYear(year);
  try {
    const response = await fetch(`/api/admin/holidays?year=${year}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return localYear(year);
    const body = (await response.json()) as { holidays?: Holiday[]; available?: boolean };
    if (!body.available || !Array.isArray(body.holidays) || body.holidays.length === 0) return localYear(year);
    return { holidays: body.holidays, source: 'server' };
  } catch {
    return localYear(year);
  }
}
