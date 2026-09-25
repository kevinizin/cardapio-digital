import { describe, expect, it } from 'vitest';
import { findNextAvailableDates } from '../../domain/availability';
import { cancelByAdmin } from '../../domain/lifecycle';
import { buildOnlineDraft, createReservation } from '../../domain/reservations';
import { parisDate, toMs } from '../../domain/time';
import type { DemoData } from '../../domain/types';
import { at } from '../../domain/__tests__/fixtures';
import { DemoStore } from '../demoStore';
import { BrowserStorageRepository, DATA_KEY, STORAGE_PREFIX } from '../repository';

const NOW = at('2026-09-15', '20:10');
const clock = () => NOW;

class FakeStorage implements Storage {
  [name: string]: unknown;
  private readonly map = new Map<string, string>();
  quota = Number.POSITIVE_INFINITY;

  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    if (value.length > this.quota) throw new DOMException('Armazenamento cheio', 'QuotaExceededError');
    this.map.set(key, String(value));
  }
}

class FakeWindowEvents {
  private readonly handlers = new Set<(event: StorageEvent) => void>();
  addEventListener(_type: string, handler: (event: StorageEvent) => void) {
    this.handlers.add(handler);
  }
  removeEventListener(_type: string, handler: (event: StorageEvent) => void) {
    this.handlers.delete(handler);
  }
  dispatch(key: string | null, storageArea: Storage) {
    this.handlers.forEach((handler) => handler({ key, storageArea } as StorageEvent));
  }
}

const events = () => new FakeWindowEvents() as unknown as Window & FakeWindowEvents;
const futureConfirmed = (data: DemoData) => data.reservations.find((r) => r.status === 'confirmed' && toMs(r.startAt) > NOW + 86_400_000)!;
const cancel = (id: string) => (data: DemoData, now: number) => cancelByAdmin(data, id, 'Teste de persistência', now);

describe('persistência local da demonstração', () => {
  it('inicializa uma única vez e preserva as mudanças após recarregar', () => {
    const storage = new FakeStorage();
    const first = new DemoStore(new BrowserStorageRepository(storage, events()), clock);
    expect(first.getSnapshot().persistence).toEqual({ mode: 'local' });
    const target = futureConfirmed(first.getSnapshot().data);
    expect(first.execute(cancel(target.id)).ok).toBe(true);

    const reloaded = new DemoStore(new BrowserStorageRepository(storage, events()), () => NOW + 3_600_000);
    const data = reloaded.getSnapshot().data;
    expect(data.seededAt).toBe(first.getSnapshot().data.seededAt);
    expect(data.reservations.find((r) => r.id === target.id)?.status).toBe('cancelled');
    expect(data.revision).toBe(first.getSnapshot().data.revision);
  });

  it('JSON inválido não é apagado: roda em memória e guarda a cópia bruta', () => {
    const storage = new FakeStorage();
    storage.setItem(DATA_KEY, '{quebrado');
    const store = new DemoStore(new BrowserStorageRepository(storage, events()), clock);
    expect(store.getSnapshot().persistence).toMatchObject({ mode: 'memory', reason: 'invalid' });
    expect(store.getInvalidRaw()).toBe('{quebrado');

    const target = futureConfirmed(store.getSnapshot().data);
    expect(store.execute(cancel(target.id)).ok).toBe(true);
    expect(storage.getItem(DATA_KEY)).toBe('{quebrado');

    store.restoreDemo();
    expect(store.getSnapshot().persistence).toEqual({ mode: 'local' });
    expect(JSON.parse(storage.getItem(DATA_KEY) as string).schemaVersion).toBe(1);
  });

  it('versão de esquema desconhecida ou dados inconsistentes também são preservados', () => {
    const storage = new FakeStorage();
    storage.setItem(DATA_KEY, JSON.stringify({ schemaVersion: 99 }));
    const store = new DemoStore(new BrowserStorageRepository(storage, events()), clock);
    const persistence = store.getSnapshot().persistence;
    expect(persistence.mode === 'memory' && persistence.detail).toContain('version');

    const other = new FakeStorage();
    const valid = new DemoStore(new BrowserStorageRepository(other, events()), clock).getSnapshot().data;
    other.setItem(DATA_KEY, JSON.stringify({ ...valid, reservations: [{ ...valid.reservations[0], tableId: 'M99' }] }));
    const broken = new DemoStore(new BrowserStorageRepository(other, events()), clock);
    expect(broken.getSnapshot().persistence).toMatchObject({ mode: 'memory', reason: 'invalid' });
  });

  it('sem localStorage, os dados ficam apenas em memória', () => {
    const store = new DemoStore(new BrowserStorageRepository(null, null, 'bloqueado pelo navegador'), clock);
    expect(store.getSnapshot().persistence).toEqual({ mode: 'memory', reason: 'unavailable', detail: 'bloqueado pelo navegador' });
    expect(store.execute(cancel(futureConfirmed(store.getSnapshot().data).id)).ok).toBe(true);
  });

  it('armazenamento cheio: mantém a alteração em memória e avisa', () => {
    const storage = new FakeStorage();
    const store = new DemoStore(new BrowserStorageRepository(storage, events()), clock);
    const target = futureConfirmed(store.getSnapshot().data);
    storage.quota = 10;
    expect(store.execute(cancel(target.id)).ok).toBe(true);
    expect(store.getSnapshot().persistence).toMatchObject({ mode: 'memory', reason: 'quota' });
    expect(store.getSnapshot().data.reservations.find((r) => r.id === target.id)?.status).toBe('cancelled');
    const saved = JSON.parse(storage.getItem(DATA_KEY) as string) as DemoData;
    expect(saved.reservations.find((r) => r.id === target.id)?.status).toBe('confirmed');
  });

  it('restaurar apaga somente as chaves desta aplicação', () => {
    const storage = new FakeStorage();
    const store = new DemoStore(new BrowserStorageRepository(storage, events()), clock);
    storage.setItem('outro-projeto:preferencias', 'manter');
    storage.setItem(`${STORAGE_PREFIX}recent-codes`, '["ABCD-EFGH"]');
    store.restoreDemo();
    expect(storage.getItem('outro-projeto:preferencias')).toBe('manter');
    expect(storage.getItem(`${STORAGE_PREFIX}recent-codes`)).toBeNull();
    expect(storage.getItem(DATA_KEY)).not.toBeNull();
  });

  it('sincroniza abas pelo evento storage e revalida antes de gravar', () => {
    const storage = new FakeStorage();
    const eventsB = events();
    const tabA = new DemoStore(new BrowserStorageRepository(storage, events()), clock);
    const tabB = new DemoStore(new BrowserStorageRepository(storage, eventsB), clock);

    const data = tabA.getSnapshot().data;
    const [suggestion] = findNextAvailableDates(data, parisDate(NOW), 2, NOW, 1);
    const created = tabA.execute((d, now) =>
      createReservation(
        d,
        buildOnlineDraft(d, {
          date: suggestion.date,
          time: suggestion.firstSlot.time,
          partySize: 2,
          customer: { name: 'Cliente Aba A', email: 'aba.a@example.com', phone: '', notes: '' },
        }),
        now,
        { channel: 'online' },
      ),
    );
    if (!created.ok) throw new Error('falha ao criar');

    eventsB.dispatch(DATA_KEY, storage);
    expect(tabB.getSnapshot().data.reservations.some((r) => r.id === created.value.reservation.id)).toBe(true);
    expect(tabB.getSnapshot().externalUpdateAt).toBe(NOW);

    // Sem evento: a aba B ainda relê o armazenamento antes de validar o comando.
    const target = futureConfirmed(tabA.getSnapshot().data);
    expect(tabA.execute(cancel(target.id)).ok).toBe(true);
    const again = tabB.execute(cancel(target.id));
    expect(again.ok ? [] : again.errors.map((e) => e.code)).toEqual(['ALREADY_CANCELLED']);
  });
});
