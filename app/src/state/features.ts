import { useEffect, useState } from 'react';
import { api, type PublicFeatures } from '../data/api';
import { useStore } from './store';

let cached: Promise<PublicFeatures> | null = null;

/** Recursos do servidor (ex.: envio de e-mails), buscados uma vez por visita. */
export function loadPublicFeatures(): Promise<PublicFeatures> {
  cached ??= api.features().catch(() => {
    cached = null;
    return { email: false };
  });
  return cached;
}

/** `null` enquanto carrega. Na demonstração, nada é enviado. */
export function usePublicFeatures(): PublicFeatures | null {
  const demo = useStore().kind === 'demo';
  const [features, setFeatures] = useState<PublicFeatures | null>(demo ? { email: false } : null);
  useEffect(() => {
    if (demo) return;
    let active = true;
    void loadPublicFeatures().then((value) => {
      if (active) setFeatures(value);
    });
    return () => {
      active = false;
    };
  }, [demo]);
  return features;
}
