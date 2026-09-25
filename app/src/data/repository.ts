import { SCHEMA_VERSION, type DemoData } from '../domain/types';
import { validateDemoData } from './schema';

/**
 * Camada de repositório: isola onde os dados moram. Hoje é o localStorage do
 * navegador; numa versão real seria substituída por uma API com banco
 * compartilhado, sem mudar as regras de negócio.
 */

export const STORAGE_PREFIX = 'maison-elise-demo:';
export const DATA_KEY = `${STORAGE_PREFIX}data`;

export type LoadResult =
  | { kind: 'ok'; data: DemoData; raw: string }
  | { kind: 'empty' }
  | { kind: 'unavailable'; detail: string }
  | { kind: 'invalid'; raw: string; reason: 'json' | 'schema' | 'version'; detail: string };

export type SaveResult = { ok: true; raw: string } | { ok: false; reason: 'quota' | 'unavailable'; detail: string };

export interface DemoRepository {
  load(): LoadResult;
  readRaw(): string | null;
  save(data: DemoData): SaveResult;
  /** Remove somente as chaves desta aplicação. */
  clearAppData(): string[];
  /** Mudanças feitas por outras abas do mesmo navegador. */
  subscribe(listener: (key: string | null) => void): () => void;
}

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/** Migrações por versão de origem (ex.: 1 → 2). Nenhuma é necessária na versão 1. */
export const MIGRATIONS: Record<number, Migration> = {};

export function parseStoredData(raw: string): LoadResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return { kind: 'invalid', raw, reason: 'json', detail: error instanceof Error ? error.message : 'JSON inválido' };
  }
  if (!value || typeof value !== 'object') return { kind: 'invalid', raw, reason: 'schema', detail: 'conteúdo não é um objeto' };
  let record = value as Record<string, unknown>;
  let version = record.schemaVersion;
  while (typeof version === 'number' && version < SCHEMA_VERSION && MIGRATIONS[version]) {
    record = MIGRATIONS[version](record);
    version = record.schemaVersion;
  }
  if (version !== SCHEMA_VERSION) {
    return { kind: 'invalid', raw, reason: 'version', detail: `versão de esquema ${String(version)} não suportada` };
  }
  const validated = validateDemoData(record);
  return validated.ok ? { kind: 'ok', data: validated.data, raw } : { kind: 'invalid', raw, reason: 'schema', detail: validated.detail };
}

export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22 || error.code === 1014;
}

type EventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export class BrowserStorageRepository implements DemoRepository {
  private readonly storage: Storage | null;
  private readonly events: EventTarget | null;
  private readonly unavailableDetail: string;

  constructor(storage: Storage | null, events: EventTarget | null, unavailableDetail = '') {
    this.storage = storage;
    this.events = events;
    this.unavailableDetail = unavailableDetail;
  }

  /** Testa o acesso real (modo privado, bloqueio de cookies e cotas podem impedir). */
  static fromWindow(): BrowserStorageRepository {
    try {
      const storage = window.localStorage;
      const probe = `${STORAGE_PREFIX}probe`;
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return new BrowserStorageRepository(storage, window);
    } catch (error) {
      return new BrowserStorageRepository(null, window, error instanceof Error ? error.message : 'localStorage indisponível');
    }
  }

  load(): LoadResult {
    if (!this.storage) return { kind: 'unavailable', detail: this.unavailableDetail };
    let raw: string | null;
    try {
      raw = this.storage.getItem(DATA_KEY);
    } catch (error) {
      return { kind: 'unavailable', detail: error instanceof Error ? error.message : 'leitura bloqueada' };
    }
    return raw === null ? { kind: 'empty' } : parseStoredData(raw);
  }

  readRaw(): string | null {
    try {
      return this.storage ? this.storage.getItem(DATA_KEY) : null;
    } catch {
      return null;
    }
  }

  save(data: DemoData): SaveResult {
    if (!this.storage) return { ok: false, reason: 'unavailable', detail: this.unavailableDetail };
    const raw = JSON.stringify(data);
    try {
      this.storage.setItem(DATA_KEY, raw);
      return { ok: true, raw };
    } catch (error) {
      return {
        ok: false,
        reason: isQuotaError(error) ? 'quota' : 'unavailable',
        detail: error instanceof Error ? error.message : 'falha ao gravar',
      };
    }
  }

  clearAppData(): string[] {
    if (!this.storage) return [];
    const removed: string[] = [];
    try {
      for (let i = this.storage.length - 1; i >= 0; i -= 1) {
        const key = this.storage.key(i);
        if (key?.startsWith(STORAGE_PREFIX)) removed.push(key);
      }
      removed.forEach((key) => this.storage?.removeItem(key));
    } catch {
      // Sem acesso: nada a remover.
    }
    return removed;
  }

  subscribe(listener: (key: string | null) => void): () => void {
    if (!this.events) return () => undefined;
    const handler = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== this.storage) return;
      if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) listener(event.key);
    };
    this.events.addEventListener('storage', handler);
    return () => this.events?.removeEventListener('storage', handler);
  }
}
