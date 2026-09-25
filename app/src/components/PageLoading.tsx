import { useEffect } from 'react';
import { useT } from '../i18n';

export function PageLoading() {
  const t = useT();
  return (
    <div className="page-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{t.common.loading}</span>
    </div>
  );
}

/** Título da aba no idioma ativo (o título recebido já vem traduzido pela página). */
export function useDocumentTitle(title: string) {
  const brand = useT().brand.name;
  useEffect(() => {
    document.title = `${title} · ${brand}`;
  }, [title, brand]);
}
