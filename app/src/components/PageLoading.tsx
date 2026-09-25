import { useEffect } from 'react';
import { t } from '../i18n';

export function PageLoading() {
  return (
    <div className="page-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{t.common.loading}</span>
    </div>
  );
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${t.brand.name}`;
  }, [title]);
}
