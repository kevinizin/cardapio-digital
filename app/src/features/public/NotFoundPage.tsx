import { Link } from 'react-router';
import { useDocumentTitle } from '../../components/PageLoading';
import { t } from '../../i18n';

export function NotFoundPage() {
  useDocumentTitle(t.public.notFound.documentTitle);
  return (
    <section className="container pub-narrow pub-section">
      <p className="eyebrow">404</p>
      <h1>{t.common.pageNotFound}</h1>
      <p className="muted">{t.common.pageNotFoundText}</p>
      <div className="cluster">
        <Link to="/" className="btn btn--primary">
          {t.common.goHome}
        </Link>
        <Link to="/reservar" className="btn">
          {t.public.nav.book}
        </Link>
      </div>
    </section>
  );
}
