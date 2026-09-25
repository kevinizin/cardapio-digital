import { Search } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { Logo, LogoLink } from '../../components/Brand';
import { DemoRibbon, PersistenceBanner } from '../../components/DemoChrome';
import { t } from '../../i18n';
import './public.css';

const p = t.public;

export function PublicLayout() {
  return (
    <div className="site">
      <a className="skip-link" href="#conteudo">
        {t.common.skipToContent}
      </a>
      <DemoRibbon area="public" />
      <header className="site-header">
        <div className="container site-header__inner">
          <LogoLink to="/" />
          <nav className="site-nav" aria-label={p.nav.label}>
            <NavLink to="/consultar" className="site-nav__link">
              <Search aria-hidden="true" />
              <span className="label-long">{p.nav.lookup}</span>
              <span className="label-short">{p.nav.lookupShort}</span>
            </NavLink>
            <Link to="/reservar" className="btn btn--primary">
              <span className="label-long">{p.nav.book}</span>
              <span className="label-short">{p.nav.bookShort}</span>
            </Link>
          </nav>
        </div>
      </header>
      <PersistenceBanner />
      <main id="conteudo" className="site-main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container site-footer__inner">
          <Logo variant="footer" />
          <div className="site-footer__text">
            <p>{p.footer.fictional}</p>
            <p>{p.footer.formats}</p>
            <p>{p.footer.noContact}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
