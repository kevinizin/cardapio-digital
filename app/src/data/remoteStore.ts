import { err, fail, ok, type DomainError, type Result } from '../domain/errors';
import type { DemoData, Reservation } from '../domain/types';
import { api as defaultApi, ApiFailure, type Api, type OnlineBookingInput } from './api';
import type { AppStore, Command, PersistenceStatus, StoreSnapshot } from './appStore';

export type Audience = 'public' | 'admin';

export interface RemoteStoreOptions {
  audience: Audience;
  api?: Api;
  clock?: () => number;
  /** Intervalo de busca de novidades no servidor (0 desliga). */
  pollMs?: number;
  /** Espera entre tentativas de salvar quando o servidor não responde. */
  retryMs?: (attempt: number) => number;
}

type AnyCommand = Command<any>;

function failureError(error: unknown): DomainError {
  if (error instanceof ApiFailure && error.rateLimited) return err('RATE_LIMITED');
  return err('NETWORK_ERROR');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dados do restaurante guardados no servidor.
 *
 * Administração: cada comando é aplicado na hora sobre os dados atuais e
 * enviado em seguida junto com a revisão em que se baseou. Se outra pessoa
 * salvou antes (conflito), os comandos pendentes são refeitos sobre a versão
 * nova do servidor; os que deixaram de valer são descartados e avisados.
 *
 * Site do cliente: recebe só a versão pública (sem dados pessoais) e cria,
 * consulta ou cancela reservas por chamadas que o servidor valida e grava.
 */
export class RemoteStore implements AppStore {
  readonly kind = 'remote' as const;
  private snapshot: StoreSnapshot;
  private confirmed: DemoData;
  private pending: AnyCommand[] = [];
  private flushing: Promise<void> | null = null;
  private readonly own = new Map<string, Reservation>();
  private readonly listeners = new Set<() => void>();
  private readonly rejectionListeners = new Set<(errors: DomainError[]) => void>();
  private readonly authListeners = new Set<() => void>();
  private readonly api: Api;
  private readonly clock: () => number;
  private readonly audience: Audience;
  private readonly retryMs: (attempt: number) => number;
  private readonly cleanup: Array<() => void> = [];
  private pulling = false;

  constructor(initial: DemoData, options: RemoteStoreOptions) {
    this.audience = options.audience;
    this.api = options.api ?? defaultApi;
    this.clock = options.clock ?? Date.now;
    this.retryMs = options.retryMs ?? ((attempt) => Math.min(30_000, 1_000 * 2 ** attempt));
    this.confirmed = initial;
    this.snapshot = { data: initial, persistence: this.status('saved'), externalUpdateAt: null };
    const pollMs = options.pollMs ?? 20_000;
    if (pollMs > 0 && typeof window !== 'undefined') {
      const interval = window.setInterval(() => void this.pull(), pollMs);
      const onVisible = () => {
        if (document.visibilityState === 'visible') void this.pull();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onVisible);
      this.cleanup.push(() => {
        window.clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onVisible);
      });
    }
  }

  static async load(audience: Audience, options: Omit<RemoteStoreOptions, 'audience'> = {}): Promise<RemoteStore> {
    const client = options.api ?? defaultApi;
    const data = audience === 'admin' ? await client.adminData() : await client.publicData();
    return new RemoteStore(data, { ...options, audience });
  }

  getSnapshot = (): StoreSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Avisos de alterações que não puderam ser salvas (o servidor mudou antes). */
  onRejected(listener: (errors: DomainError[]) => void): () => void {
    this.rejectionListeners.add(listener);
    return () => this.rejectionListeners.delete(listener);
  }

  /** Sessão da administração expirou: é preciso entrar de novo. */
  onAuthLost(listener: () => void): () => void {
    this.authListeners.add(listener);
    return () => this.authListeners.delete(listener);
  }

  now(): number {
    return this.clock();
  }

  getInvalidRaw(): string | null {
    return null;
  }

  refresh(): boolean {
    void this.pull();
    return false;
  }

  restoreDemo(): void {
    // Sem efeito: os dados reais nunca são substituídos por dados fictícios.
  }

  exportJson(): string {
    return JSON.stringify(this.snapshot.data, null, 2);
  }

  /** Aguarda o fim dos salvamentos em andamento (usado em testes e ao sair). */
  async settle(): Promise<void> {
    while (this.flushing) await this.flushing;
  }

  dispose(): void {
    this.cleanup.forEach((fn) => fn());
    this.listeners.clear();
  }

  // ——— Administração ———

  execute<T extends { data: DemoData }>(command: Command<T>): Result<T> {
    if (this.audience !== 'admin') return fail(err('SAVE_REJECTED'));
    const current = this.snapshot.data;
    const result = command(current, this.clock());
    if (!result.ok) return result;
    if (result.value.data === current) return result;
    const data: DemoData = { ...result.value.data, revision: current.revision + 1 };
    this.pending.push(command);
    this.emit({ ...this.snapshot, data, persistence: this.status('saving') });
    this.startFlush();
    return { ...result, value: { ...result.value, data } };
  }

  private startFlush() {
    if (!this.flushing) {
      this.flushing = this.flush().finally(() => {
        this.flushing = null;
      });
    }
  }

  private async flush(): Promise<void> {
    let attempt = 0;
    while (this.pending.length) {
      const target = this.snapshot.data;
      const count = this.pending.length;
      try {
        const response = await this.api.saveAdminData(this.confirmed.revision, target);
        attempt = 0;
        if (response.ok) {
          this.confirmed = target;
          this.pending.splice(0, count);
        } else {
          this.confirmed = response.data;
          this.rebase();
        }
      } catch (error) {
        if (error instanceof ApiFailure && error.unauthorized) {
          this.setPersistence(this.status('offline'));
          this.authListeners.forEach((listener) => listener());
          return;
        }
        if (error instanceof ApiFailure && error.status === 400) {
          // O servidor recusou os dados: volta para a última versão aceita.
          this.pending = [];
          this.emit({ ...this.snapshot, data: this.confirmed, persistence: this.status('saved') });
          this.rejectionListeners.forEach((listener) => listener([err('SAVE_REJECTED')]));
          return;
        }
        this.setPersistence(this.status('offline'));
        await sleep(this.retryMs(attempt));
        attempt += 1;
      }
    }
    this.setPersistence(this.status('saved'));
  }

  /** Refaz os comandos pendentes sobre a versão mais recente do servidor. */
  private rebase() {
    let data = this.confirmed;
    const kept: AnyCommand[] = [];
    const errors: DomainError[] = [];
    for (const command of this.pending) {
      const result = command(data, this.clock());
      if (!result.ok) {
        errors.push(...result.errors);
        continue;
      }
      if (result.value.data === data) continue;
      data = { ...result.value.data, revision: data.revision + 1 };
      kept.push(command);
    }
    this.pending = kept;
    this.emit({ ...this.snapshot, data, externalUpdateAt: this.clock(), persistence: this.status(kept.length ? 'saving' : 'saved') });
    if (errors.length) {
      const notice = [err('SAVE_REJECTED'), ...errors];
      this.rejectionListeners.forEach((listener) => listener(notice));
    }
  }

  /** Busca novidades do servidor; ignorada enquanto há alterações locais a salvar. */
  private async pull(): Promise<void> {
    if (this.pulling || this.pending.length || this.flushing) return;
    this.pulling = true;
    try {
      const data = this.audience === 'admin' ? await this.api.adminData() : await this.api.publicData();
      if (this.pending.length || this.flushing) return;
      if (data.revision === this.confirmed.revision) {
        if (this.snapshot.persistence.mode === 'remote' && this.snapshot.persistence.sync === 'offline') {
          this.setPersistence(this.status('saved'));
        }
        return;
      }
      this.acceptServerData(data, true);
    } catch (error) {
      if (error instanceof ApiFailure && error.unauthorized && this.audience === 'admin') {
        this.authListeners.forEach((listener) => listener());
      }
    } finally {
      this.pulling = false;
    }
  }

  // ——— Site do cliente ———

  async createOnline(input: OnlineBookingInput): Promise<Result<{ reservation: Reservation }>> {
    try {
      const response = await this.api.createOnline(input);
      if (response.data) this.acceptServerData(response.data, false);
      if (!response.ok) return fail(...response.errors);
      this.own.set(response.reservation.id, response.reservation);
      this.acceptServerData(this.confirmed, false);
      return ok({ reservation: response.reservation });
    } catch (error) {
      return fail(failureError(error));
    }
  }

  async lookup(code: string, email: string): Promise<Result<{ reservation: Reservation | null }>> {
    try {
      const { reservation } = await this.api.lookup(code, email);
      if (reservation) {
        this.own.set(reservation.id, reservation);
        this.acceptServerData(this.confirmed, false);
      }
      return ok({ reservation });
    } catch (error) {
      return fail(failureError(error));
    }
  }

  async cancelOnline(code: string, email: string): Promise<Result<{ reservation: Reservation }>> {
    try {
      const response = await this.api.cancelOnline(code, email);
      if (response.data) this.acceptServerData(response.data, false);
      if (!response.ok) return fail(...response.errors);
      this.own.set(response.reservation.id, response.reservation);
      this.acceptServerData(this.confirmed, false);
      return ok({ reservation: response.reservation });
    } catch (error) {
      return fail(failureError(error));
    }
  }

  // ——— Internos ———

  private acceptServerData(data: DemoData, external: boolean) {
    this.confirmed = data;
    this.emit({
      ...this.snapshot,
      data: this.withOwn(data),
      persistence: this.status('saved'),
      externalUpdateAt: external ? this.clock() : this.snapshot.externalUpdateAt,
    });
  }

  /** No site do cliente, junta as reservas do próprio visitante (com os dados completos). */
  private withOwn(data: DemoData): DemoData {
    if (!this.own.size) return data;
    const ids = new Set(data.reservations.map((r) => r.id));
    const reservations = data.reservations.map((r) => this.own.get(r.id) ?? r);
    this.own.forEach((reservation, id) => {
      if (!ids.has(id)) reservations.push(reservation);
    });
    return { ...data, reservations };
  }

  private status(sync: 'saved' | 'saving' | 'offline'): PersistenceStatus {
    return { mode: 'remote', sync, pending: this.pending.length };
  }

  private setPersistence(persistence: PersistenceStatus) {
    this.emit({ ...this.snapshot, persistence });
  }

  private emit(next: StoreSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
