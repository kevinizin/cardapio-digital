import { Search } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { Logo, LogoLink } from '../../components/Brand';
import { hasContact } from '../../config/restaurant';
import { DemoRibbon, PersistenceBanner } from '../../components/DemoChrome';
import { useT } from '../../i18n';
import { useStore } from '../../state/store';
import { ContactList, LanguageSwitcher } from './PublicChrome';
import './public.css';

export function PublicLayout() {
  const t = useT();
  const p = t.public;
  const demo = useStore().kind === 'demo';
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
            <LanguageSwitcher className="site-nav__lang" />
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
            <p>{p.footer.tagline}</p>
            <ContactList />
            <p>{p.footer.formats}</p>
            {demo && !hasContact() && <p>{p.footer.demoNoContact}</p>}
          </div>
          <LanguageSwitcher className="site-footer__lang" />
        </div>
      </footer>
    </div>
  );
}
