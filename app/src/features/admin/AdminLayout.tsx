import { CalendarDays, ChartColumn, LayoutDashboard, List, Map as MapIcon, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { LogoLink, ParisClock } from '../../components/Brand';
import { DemoRibbon, PersistenceBanner } from '../../components/DemoChrome';
import { t } from '../../i18n';
import { useStore } from '../../state/store';
import { AdminActionsProvider } from './AdminActions';

const a = t.admin.layout;

const NAV: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
  { to: '/admin', label: a.nav.overview, icon: <LayoutDashboard aria-hidden="true" />, end: true },
  { to: '/admin/agenda', label: a.nav.agenda, icon: <CalendarDays aria-hidden="true" /> },
  { to: '/admin/salao', label: a.nav.floor, icon: <MapIcon aria-hidden="true" /> },
  { to: '/admin/reservas', label: a.nav.reservations, icon: <List aria-hidden="true" /> },
  { to: '/admin/mensal', label: a.nav.monthly, icon: <ChartColumn aria-hidden="true" /> },
  { to: '/admin/configuracoes', label: a.nav.settings, icon: <Settings aria-hidden="true" /> },
];

function NavItems({ className }: { className: string }) {
  return (
    <ul className={className}>
      {NAV.map((item) => (
        <li key={item.to}>
          <NavLink to={item.to} end={item.end} className="adm-nav__link">
            {item.icon}
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function AdminLayout() {
  const demo = useStore().kind === 'demo';
  return (
    <AdminActionsProvider>
      <div className="adm">
        <a className="skip-link" href="#conteudo">
          {t.common.skipToContent}
        </a>
        <DemoRibbon area="admin" />
        <header className="adm-topbar">
          <div className="adm-topbar__row">
            <LogoLink to="/admin" variant="sidebar" />
            <span className="adm-topbar__label">{a.title}</span>
          </div>
          <nav aria-label={a.navLabel}>
            <NavItems className="adm-tabs" />
          </nav>
        </header>
        <div className="adm-shell">
          <aside className="adm-sidebar">
            <div className="adm-sidebar__brand">
              <LogoLink to="/admin" variant="sidebar" />
              <span className="adm-sidebar__label">{a.title}</span>
            </div>
            <nav aria-label={a.navLabel}>
              <NavItems className="adm-nav" />
            </nav>
            <div className="adm-sidebar__foot">
              <ParisClock />
              {demo && <p>{a.demoNote}</p>}
            </div>
          </aside>
          <main id="conteudo" className="adm-main" tabIndex={-1}>
            <PersistenceBanner />
            <Outlet />
          </main>
        </div>
      </div>
    </AdminActionsProvider>
  );
}

export function PageHead({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="adm-page-head">
      <div className="adm-page-head__text">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="adm-page-head__actions">{actions}</div>}
    </header>
  );
}
