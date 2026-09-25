import type { Result } from '../domain/errors';
import { createDemoData } from '../domain/seed';
import type { DemoData } from '../domain/types';
import { DATA_KEY, parseStoredData, type DemoRepository, type SaveResult } from './repository';

export type PersistenceStatus =
  | { mode: 'local' }
  | { mode: 'memory'; reason: 'unavailable' | 'quota' | 'invalid'; detail: string };

export interface StoreSnapshot {
  data: DemoData;
  persistence: PersistenceStatus;
  /** Instante da última atualização vinda de outra aba. */
  externalUpdateAt: number | null;
}

export type Clock = () => number;

/**
 * Fonte única de dados das duas interfaces. Cada comando relê o armazenamento
 * antes de validar (dados recentes, inclusive de outras abas) e só grava se
 * as regras aprovarem. Isso reduz, mas não elimina, corridas entre abas: não
 * há transação atômica no localStorage.
 */
export class DemoStore {
  private snapshot: StoreSnapshot;
  private readonly listeners = new Set<() => void>();
  private lastRaw: string | null = null;
  private invalidRaw: string | null = null;
  private readonly unsubscribe: () => void;
  private readonly repository: DemoRepository;
  private readonly clock: Clock;

  constructor(repository: DemoRepository, clock: Clock = Date.now) {
    this.repository = repository;
    this.clock = clock;
    const loaded = repository.load();
    if (loaded.kind === 'ok') {
      this.lastRaw = loaded.raw;
      this.snapshot = { data: loaded.data, persistence: { mode: 'local' }, externalUpdateAt: null };
    } else if (loaded.kind === 'empty') {
      const data = createDemoData(clock());
      this.snapshot = { data, persistence: this.persistenceFrom(repository.save(data)), externalUpdateAt: null };
    } else if (loaded.kind === 'unavailable') {
      this.snapshot = {
        data: createDemoData(clock()),
        persistence: { mode: 'memory', reason: 'unavailable', detail: loaded.detail },
        externalUpdateAt: null,
      };
    } else {
      // Dados salvos ilegíveis: nada é apagado. A demonstração roda em memória até o usuário decidir.
      this.invalidRaw = loaded.raw;
      this.snapshot = {
        data: createDemoData(clock()),
        persistence: { mode: 'memory', reason: 'invalid', detail: `${loaded.reason}: ${loaded.detail}` },
        externalUpdateAt: null,
      };
    }
    this.unsubscribe = repository.subscribe((key) => this.handleExternalChange(key));
  }

  getSnapshot = (): StoreSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  now(): number {
    return this.clock();
  }

  /** Cópia bruta dos dados que não puderam ser lidos (para download). */
  getInvalidRaw(): string | null {
    return this.invalidRaw;
  }

  private emit(next: StoreSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private persistenceFrom(saved: SaveResult): PersistenceStatus {
    if (saved.ok) {
      this.lastRaw = saved.raw;
      return { mode: 'local' };
    }
    return { mode: 'memory', reason: saved.reason, detail: saved.detail };
  }

  /** Relê o armazenamento; retorna true se os dados mudaram. */
  refresh(): boolean {
    if (this.snapshot.persistence.mode !== 'local') return false;
    const raw = this.repository.readRaw();
    if (raw === this.lastRaw) return false;
    if (raw === null) {
      // As chaves foram removidas fora desta aba: recria a demonstração.
      const data = createDemoData(this.clock());
      this.emit({ ...this.snapshot, data, persistence: this.persistenceFrom(this.repository.save(data)) });
      return true;
    }
    const parsed = parseStoredData(raw);
    if (parsed.kind === 'ok') {
      this.lastRaw = raw;
      this.emit({ ...this.snapshot, data: parsed.data });
      return true;
    }
    if (parsed.kind === 'invalid') {
      this.invalidRaw = raw;
      this.emit({ ...this.snapshot, persistence: { mode: 'memory', reason: 'invalid', detail: `${parsed.reason}: ${parsed.detail}` } });
    }
    return false;
  }

  /** Executa um comando de domínio sobre os dados mais recentes e persiste o resultado. */
  execute<T extends { data: DemoData }>(command: (data: DemoData, nowMs: number) => Result<T>): Result<T> {
    this.refresh();
    const result = command(this.snapshot.data, this.clock());
    if (!result.ok) return result;
    // Comando válido sem alteração (ex.: edição sem mudanças): nada a gravar.
    if (result.value.data === this.snapshot.data) return result;
    const data: DemoData = { ...result.value.data, revision: this.snapshot.data.revision + 1 };
    const current = this.snapshot.persistence;
    const persistence =
      current.mode === 'memory' && current.reason !== 'quota'
        ? current
        : this.persistenceFrom(this.repository.save(data));
    this.emit({ ...this.snapshot, data, persistence });
    return { ...result, value: { ...result.value, data } };
  }

  /** Recria os dados fictícios apagando apenas as chaves desta aplicação. */
  restoreDemo(): void {
    const data = createDemoData(this.clock());
    this.repository.clearAppData();
    this.invalidRaw = null;
    this.emit({ data, persistence: this.persistenceFrom(this.repository.save(data)), externalUpdateAt: null });
  }

  exportJson(): string {
    return JSON.stringify(this.snapshot.data, null, 2);
  }

  private handleExternalChange(key: string | null) {
    if (key !== null && key !== DATA_KEY) return;
    if (this.refresh()) this.emit({ ...this.snapshot, externalUpdateAt: this.clock() });
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
  }
}
