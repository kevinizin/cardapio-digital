import { Link, Route, Routes } from 'react-router';
import { AdminLayout } from './AdminLayout';
import { AgendaPage } from './AgendaPage';
import { FloorPage } from './FloorPage';
import { MonthlyPage } from './MonthlyPage';
import { OverviewPage } from './OverviewPage';
import { ReservationsPage } from './ReservationsPage';
import { SettingsPage } from './SettingsPage';
import { t } from '../../i18n';
import './admin.css';

function AdminNotFound() {
  return (
    <section className="stack">
      <h1>{t.common.pageNotFound}</h1>
      <p className="muted">{t.common.pageNotFoundText}</p>
      <Link to="/admin" className="btn btn--primary" style={{ justifySelf: 'start' }}>
        {t.admin.layout.nav.overview}
      </Link>
    </section>
  );
}

export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="salao" element={<FloorPage />} />
        <Route path="reservas" element={<ReservationsPage />} />
        <Route path="mensal" element={<MonthlyPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<AdminNotFound />} />
      </Route>
    </Routes>
  );
}
