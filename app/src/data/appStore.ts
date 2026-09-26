import type { Result } from '../domain/errors';
import type { DemoData, Reservation } from '../domain/types';
import type { OnlineBookingInput } from './api';

export type PersistenceStatus =
  | { mode: 'local' }
  | { mode: 'memory'; reason: 'unavailable' | 'quota' | 'invalid'; detail: string }
  /** Dados no servidor. `offline`: alterações aguardando conexão para serem salvas. */
  | { mode: 'remote'; sync: 'saved' | 'saving' | 'offline'; pending: number };

export interface StoreSnapshot {
  data: DemoData;
  persistence: PersistenceStatus;
  /** Instante da última atualização vinda de fora (outra aba ou outro aparelho). */
  externalUpdateAt: number | null;
}

export type Command<T extends { data: DemoData }> = (data: DemoData, nowMs: number) => Result<T>;

/**
 * O que as telas usam da fonte de dados. Há duas implementações: a
 * demonstração no navegador (DemoStore) e o restaurante real (RemoteStore).
 */
export interface AppStore {
  readonly kind: 'demo' | 'remote';
  getSnapshot(): StoreSnapshot;
  subscribe(listener: () => void): () => void;
  now(): number;
  getInvalidRaw(): string | null;
  /** Pede dados mais recentes; retorna true se já mudaram (a versão remota atualiza depois). */
  refresh(): boolean;
  /** Comando da administração: aplicado na hora e salvo em seguida. */
  execute<T extends { data: DemoData }>(command: Command<T>): Result<T>;
  restoreDemo(): void;
  exportJson(): string;

  /** Fluxo público: validado e gravado pelo servidor. */
  createOnline(input: OnlineBookingInput): Promise<Result<{ reservation: Reservation }>>;
  lookup(code: string, email: string): Promise<Result<{ reservation: Reservation | null }>>;
  cancelOnline(code: string, email: string): Promise<Result<{ reservation: Reservation }>>;
}
