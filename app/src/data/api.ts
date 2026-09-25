import type { DomainError } from '../domain/errors';
import type { Customer, DemoData, LocalDate, LocalTime, Reservation } from '../domain/types';

/** Contrato HTTP entre o site e o servidor (mesma origem, JSON). */

export interface OnlineBookingInput {
  date: LocalDate;
  time: LocalTime;
  partySize: number;
  customer: Customer;
}

export type PublicCommandResponse =
  | { ok: true; reservation: Reservation; data: DemoData }
  | { ok: false; errors: DomainError[]; data?: DemoData };

export interface LookupResponse {
  reservation: Reservation | null;
}

export type SaveResponse = { ok: true; revision: number } | { ok: false; conflict: true; data: DemoData };

/** Falha de transporte ou de autorização (as regras de negócio voltam como `errors`). */
export class ApiFailure extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiFailure';
    this.status = status;
  }
  get unauthorized(): boolean {
    return this.status === 401;
  }
  get rateLimited(): boolean {
    return this.status === 429;
  }
  get network(): boolean {
    return this.status === 0;
  }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...rest,
      headers: { Accept: 'application/json', ...(json === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: json === undefined ? rest.body : JSON.stringify(json),
    });
  } catch (error) {
    throw new ApiFailure(0, error instanceof Error ? error.message : 'falha de rede');
  }
  // 409 (conflito) e 422 (regra de negócio) trazem corpo útil.
  if (!response.ok && response.status !== 409 && response.status !== 422) {
    throw new ApiFailure(response.status, `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  publicData: () => request<DemoData>('/api/public/data'),
  createOnline: (input: OnlineBookingInput) =>
    request<PublicCommandResponse>('/api/public/reservations', { method: 'POST', json: input }),
  lookup: (code: string, email: string) =>
    request<LookupResponse>('/api/public/lookup', { method: 'POST', json: { code, email } }),
  cancelOnline: (code: string, email: string) =>
    request<PublicCommandResponse>('/api/public/cancel', { method: 'POST', json: { code, email } }),

  session: () => request<{ authenticated: boolean }>('/api/admin/session'),
  login: (password: string) => request<{ ok: true }>('/api/admin/login', { method: 'POST', json: { password } }),
  logout: () => request<{ ok: true }>('/api/admin/logout', { method: 'POST', json: {} }),
  adminData: () => request<DemoData>('/api/admin/data'),
  saveAdminData: (baseRevision: number, data: DemoData) =>
    request<SaveResponse>('/api/admin/data', { method: 'PUT', json: { baseRevision, data } }),
};

export type Api = typeof api;
