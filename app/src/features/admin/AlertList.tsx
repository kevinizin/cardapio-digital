import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import type { OperationalAlert } from '../../domain/alerts';
import { t } from '../../i18n';
import { useData } from '../../state/store';
import { useAdminActions } from './AdminActions';
import { alertText } from './adminFormat';

const a = t.admin.alerts;
const ICONS = { critical: CircleAlert, warning: TriangleAlert, info: Info } as const;

export function AlertList({ alerts, limit }: { alerts: OperationalAlert[]; limit?: number }) {
  const data = useData();
  const actions = useAdminActions();
  if (!alerts.length) return <p className="subtle">{a.none}</p>;
  const visible = limit ? alerts.slice(0, limit) : alerts;
  return (
    <ul className="alert-list">
      {visible.map((alert) => {
        const Icon = ICONS[alert.severity];
        return (
          <li key={alert.id} className={`alert-item alert-item--${alert.severity}`}>
            <Icon aria-hidden="true" />
            <div className="alert-item__body">
              <span className="alert-item__severity">{a.severity[alert.severity]}</span>
              <p>{alertText(alert, data)}</p>
              <div className="cluster">
                {alert.reservationId && (
                  <button type="button" className="btn btn--sm" onClick={() => actions.openReservation(alert.reservationId as string)}>
                    {a.open}
                  </button>
                )}
                {alert.nextReservationId && (
                  <button type="button" className="btn btn--sm" onClick={() => actions.openReservation(alert.nextReservationId as string)}>
                    {a.openNext}
                  </button>
                )}
                {alert.kind === 'pending_update' && (
                  <Link className="btn btn--sm" to="/admin/reservas?status=confirmed&periodo=passadas">
                    {a.reviewPending}
                  </Link>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
