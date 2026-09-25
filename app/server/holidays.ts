import { z } from 'zod';
import type { Holiday } from '../src/domain/holidays';

/**
 * Feriados da França para a administração (GET /api/admin/holidays?year=AAAA).
 * Consulta o Nager.Date com limite de 5 s e guarda cada ano em memória por
 * 24 h. Se o serviço falhar, responde 200 com lista vazia e `available: false`,
 * para a tela seguir funcionando sem as sugestões.
 */

export const NAGER_URL = (year: number) => `https://date.nager.at/api/v3/PublicHolidays/${year}/FR`;
const DAY_MS = 24 * 60 * 60_000;

const nagerSchema = z.array(
  z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    localName: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    /** Feriados regionais (ex.: Alsácia-Mosela) vêm com global = false. */
    global: z.boolean().optional(),
  }),
);

export interface HolidaysResponse {
  year: number;
  holidays: Holiday[];
  /** false quando o serviço externo não respondeu (lista vazia). */
  available: boolean;
}

export interface HolidaysOptions {
  fetchImpl?: typeof fetch;
  clock?: () => number;
  timeoutMs?: number;
  ttlMs?: number;
}

export type HolidaysResult = { status: 200; body: HolidaysResponse } | { status: 400; body: { error: string } };

export function parseYear(value: string | null): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= 2000 && year <= 2100 ? year : null;
}

export function createHolidaysService(options: HolidaysOptions = {}) {
  const clock = options.clock ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const ttlMs = options.ttlMs ?? DAY_MS;
  const cache = new Map<number, { at: number; holidays: Holiday[] }>();

  async function fetchYear(year: number): Promise<Holiday[] | null> {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    try {
      const response = await fetchImpl(NAGER_URL(year), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return null;
      const parsed = nagerSchema.safeParse(await response.json());
      if (!parsed.success) return null;
      return parsed.data
        .filter((h) => h.global !== false && h.date.startsWith(`${year}-`))
        .map(({ date, localName, name }) => ({ date, localName, name }));
    } catch {
      return null;
    }
  }

  async function holidays(year: number): Promise<HolidaysResponse> {
    const cached = cache.get(year);
    if (cached && clock() - cached.at < ttlMs) return { year, holidays: cached.holidays, available: true };
    const fetched = await fetchYear(year);
    if (!fetched) return { year, holidays: [], available: false };
    cache.set(year, { at: clock(), holidays: fetched });
    return { year, holidays: fetched, available: true };
  }

  /** Trata a URL da requisição (já autenticada como administração). */
  async function handle(url: string | undefined): Promise<HolidaysResult> {
    const year = parseYear(new URL(url ?? '/', 'http://localhost').searchParams.get('year'));
    if (year === null) return { status: 400, body: { error: 'ano inválido' } };
    return { status: 200, body: await holidays(year) };
  }

  return { holidays, handle };
}

/** Instância usada pelo servidor (cache compartilhado entre requisições). */
export const adminHolidays = createHolidaysService();
