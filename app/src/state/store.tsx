import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { DemoStore, StoreSnapshot } from '../data/demoStore';
import type { DemoData } from '../domain/types';

const StoreContext = createContext<DemoStore | null>(null);

export function StoreProvider({ store, children }: { store: DemoStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): DemoStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreProvider ausente na árvore de componentes.');
  return store;
}

export function useSnapshot(): StoreSnapshot {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useData(): DemoData {
  return useSnapshot().data;
}

/**
 * Relógio da interface: atualiza periodicamente, ao voltar para a aba e a cada
 * alteração dos dados (para que a ação recém-registrada apareça na hora).
 */
export function useNow(intervalMs = 15_000): number {
  const store = useStore();
  const [now, setNow] = useState(() => store.now());
  useEffect(() => {
    const tick = () => setNow(store.now());
    const interval = window.setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const unsubscribe = store.subscribe(tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
    };
  }, [store, intervalMs]);
  return now;
}
