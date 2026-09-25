import {
  Ban,
  CalendarCheck,
  CircleCheck,
  CircleX,
  Clock,
  Footprints,
  Globe,
  Lock,
  Phone,
  Sparkles,
  Users,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import type { LiveTableState } from '../domain/occupancy';
import type { ReservationSource, ReservationStatus } from '../domain/types';
import { useT } from '../i18n';

export const RESERVATION_STATUS_ICONS: Record<ReservationStatus, LucideIcon> = {
  confirmed: CalendarCheck,
  seated: Users,
  completed: CircleCheck,
  cancelled: CircleX,
  no_show: UserX,
};

export const TABLE_STATE_ICONS: Record<LiveTableState, LucideIcon> = {
  free: CircleCheck,
  reserved: Clock,
  occupied: Users,
  prep: Sparkles,
  blocked: Lock,
  inactive: Ban,
};

export const SOURCE_ICONS: Record<ReservationSource, LucideIcon> = {
  online: Globe,
  phone: Phone,
  walk_in: Footprints,
};

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const t = useT();
  const Icon = RESERVATION_STATUS_ICONS[status];
  return (
    <span className={`badge badge--${status}`}>
      <Icon aria-hidden="true" />
      {t.reservationStatus[status]}
    </span>
  );
}

export function TableStateBadge({ state, forecast = false }: { state: LiveTableState; forecast?: boolean }) {
  const t = useT();
  const Icon = TABLE_STATE_ICONS[state];
  return (
    <span className={`badge badge--${state}`}>
      <Icon aria-hidden="true" />
      {t.tableState[state]}
      {forecast && <span className="visually-hidden"> (previsão)</span>}
    </span>
  );
}

export function SourceLabel({ source }: { source: ReservationSource }) {
  const t = useT();
  const Icon = SOURCE_ICONS[source];
  return (
    <span className="source-label">
      <Icon aria-hidden="true" />
      {t.source[source]}
    </span>
  );
}
