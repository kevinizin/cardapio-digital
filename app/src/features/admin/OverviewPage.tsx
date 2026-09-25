import { CalendarDays, Footprints, LogIn, Map as MapIcon, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { ReservationStatusBadge, TABLE_STATE_ICONS } from '../../components/Badges';
import { EmptyState, Notice } from '../../components/Feedback';
import { InfoTip } from '../../components/Field';
import { useDocumentTitle } from '../../components/PageLoading';
import { getOperationalAlerts, upcomingArrivals } from '../../domain/alerts';
import { computeDayOverview } from '../../domain/metrics';
import { getAreaLoad, getLiveTableStatus, isSharedTable, type LiveTableState } from '../../domain/occupancy';
import { currentOrNextShift, getShiftsForDate } from '../../domain/schedule';
import { MINUTE_MS, parisDate, toMs } from '../../domain/time';
import { formatLocalDateCompact, formatLocalDateLong, formatNumber, formatTime, t } from '../../i18n';
import { useData, useNow } from '../../state/store';
import { useAdminActions } from './AdminActions';
import { PageHead } from './AdminLayout';
import { placeLabel } from './adminFormat';
import { AlertList } from './AlertList';
import './floor.css';

const o = t.admin.overview;
const STATES: LiveTableState[] = ['free', 'reserved', 'occupied', 'prep', 'blocked', 'inactive'];

export function OverviewPage() {
  useDocumentTitle(o.documentTitle);
  const data = useData();
  const now = useNow(15_000);
  const actions = useAdminActions();
  const today = parisDate(now);

  const overview = useMemo(() => computeDayOverview(data, today, now), [data, today, now]);
  const alerts = useMemo(() => getOperationalAlerts(data, now), [data, now]);
  const upcoming = useMemo(() => upcomingArrivals(data, now), [data, now]);
  const counts = useMemo(() => {
    const map = Object.fromEntries(STATES.map((state) => [state, 0])) as Record<LiveTableState, number>;
    for (const table of data.tables) if (!isSharedTable(table)) map[getLiveTableStatus(table, data, now).state] += 1;
    return map;
  }, [data, now]);
  const hasPlainTables = data.tables.some((table) => !isSharedTable(table));
  const areaLoads = useMemo(
    () => data.tables.filter((table) => isSharedTable(table) && table.active).map((table) => ({ table, load: getAreaLoad(table, data, now, now) })),
    [data, now],
  );

  const todayShifts = getShiftsForDate(data.settings, today);
  const shiftInfo = currentOrNextShift(data.settings, now);
  const nextLabel = shiftInfo ? `${formatLocalDateCompact(shiftInfo.shift.date)} às ${formatTime(shiftInfo.shift.startMs)}` : '';
  const status = shiftInfo?.isCurrent
    ? o.openNow(t.shift[shiftInfo.shift.kind], `${shiftInfo.shift.start}–${shiftInfo.shift.end}`)
    : todayShifts.length === 0
      ? `${o.closedToday} · ${o.nextShift(nextLabel)}`
      : o.nextShift(nextLabel);

  const nextDay = !todayShifts.length && shiftInfo ? computeDayOverview(data, shiftInfo.shift.date, now) : null;

  return (
    <>
      <PageHead
        title={o.title}
        description={`${formatLocalDateLong(today)} · ${status}`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => actions.createReservation({ source: 'walk_in', date: today })}>
              <Footprints aria-hidden="true" />
              {o.walkIn}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => actions.createReservation()}>
              <Plus aria-hidden="true" />
              {o.newReservation}
            </button>
          </>
        }
      />

      <div className="kpi-grid">
        <div className="kpi">
          <p className="kpi__label">
            {o.kpiExpected}
            <InfoTip label={o.kpiExpected}>{o.kpiExpectedHint}</InfoTip>
          </p>
          <p className="kpi__value">{formatNumber(overview.expectedReservations)}</p>
          <p className="kpi__meta">{o.kpiExpectedMeta(overview.completedReservations, overview.noShows, overview.cancellations)}</p>
        </div>
        <div className="kpi">
          <p className="kpi__label">
            {o.kpiPeople}
            <InfoTip label={o.kpiPeople}>{o.kpiPeopleHint}</InfoTip>
          </p>
          <p className="kpi__value">{formatNumber(overview.expectedPeople)}</p>
          <p className="kpi__meta">{o.kpiPeopleMeta}</p>
        </div>
        <div className="kpi">
          <p className="kpi__label">
            {o.kpiPresent}
            <InfoTip label={o.kpiPresent}>{o.kpiPresentHint}</InfoTip>
          </p>
          <p className="kpi__value">{formatNumber(overview.presentPeople)}</p>
          <p className="kpi__meta">
            {hasPlainTables ? o.kpiPresentMeta(overview.presentReservations) : o.kpiPresentMetaGroups(overview.presentReservations)}
          </p>
        </div>
        {overview.seats && (
          <div className="kpi">
            <p className="kpi__label">
              {o.kpiSeats}
              <InfoTip label={o.kpiSeats} align="end">
                {o.kpiSeatsHint}
              </InfoTip>
            </p>
            <p className="kpi__value">{formatNumber(overview.seats.freeNow)}</p>
            <p className="kpi__meta">{o.kpiSeatsMeta(overview.seats.total)}</p>
          </div>
        )}
        {hasPlainTables && (
          <div className="kpi">
            <p className="kpi__label">
              {o.kpiFree}
              <InfoTip label={o.kpiFree} align="end">
                {o.kpiFreeHint}
              </InfoTip>
            </p>
            <p className="kpi__value">{formatNumber(overview.freeTablesNow)}</p>
            <p className="kpi__meta">{o.kpiFreeMeta(overview.activeTables)}</p>
          </div>
        )}
      </div>

      <div className="adm-grid adm-grid--sidebar">
        <div className="adm-grid">
          {nextDay && shiftInfo && (
            <Notice tone="neutral" title={o.closedTitle}>
              <p>
                {o.nextOpenDay(formatLocalDateLong(shiftInfo.shift.date))} ·{' '}
                {o.nextOpenDayCount(t.common.reservations(nextDay.expectedReservations), t.common.people(nextDay.expectedPeople))}
              </p>
            </Notice>
          )}

          <section className="card" aria-labelledby="overview-upcoming">
            <header className="card__header">
              <h2 id="overview-upcoming" className="card__title">
                {o.upcomingTitle}
              </h2>
              <Link to="/admin/agenda" className="btn btn--sm">
                <CalendarDays aria-hidden="true" />
                {o.seeAgenda}
              </Link>
            </header>
            {upcoming.length === 0 ? (
              <EmptyState title={o.upcomingEmpty} />
            ) : (
              <ul className="res-list">
                {upcoming.slice(0, 12).map((r) => {
                  const start = toMs(r.startAt);
                  const late = now > start ? Math.floor((now - start) / MINUTE_MS) : 0;
                  return (
                    <li className="res-item" key={r.id}>
                      <span className="res-item__time num">{formatTime(start)}</span>
                      <div className="res-item__main">
                        <span className="res-item__name">
                          <button type="button" onClick={() => actions.openReservation(r.id)}>
                            {r.customer.name}
                          </button>
                        </span>
                        <span className="res-item__meta">
                          <span>{placeLabel(data.tables, r.tableId)}</span>
                          <span>{t.common.people(r.partySize)}</span>
                          <ReservationStatusBadge status={r.status} />
                          {late > 0 && <span className="badge badge--warning">{o.lateBadge(late)}</span>}
                        </span>
                      </div>
                      <div className="res-item__actions">
                        <button type="button" className="btn btn--sm btn--primary" onClick={() => actions.startAction('arrive', r.id)}>
                          <LogIn aria-hidden="true" />
                          {t.admin.actions.arrive}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="overview-floor">
            <header className="card__header">
              <h2 id="overview-floor" className="card__title">
                {o.floorTitle}
              </h2>
              <Link to="/admin/salao" className="btn btn--sm">
                <MapIcon aria-hidden="true" />
                {hasPlainTables ? o.floorLink : o.floorLinkAreas}
              </Link>
            </header>
            <div className="card__body stack">
              {areaLoads.map(({ table, load }) => {
                const used = load.block ? table.capacity : Math.min(table.capacity, load.load);
                const name = t.area[table.area];
                return (
                  <div key={table.id} className="overview-area">
                    <p className="overview-area__label">
                      <strong>{name}</strong>
                      <span className="num">{t.admin.floor.areaUsage(used, table.capacity)}</span>
                    </p>
                    <div
                      className="area-meter"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={table.capacity}
                      aria-valuenow={used}
                      aria-label={t.admin.floor.areaMeter(name, used, table.capacity)}
                    >
                      <span
                        className={`area-meter__part area-meter__part--${load.block ? 'blocked' : 'seated'}`}
                        style={{ width: `${(used / Math.max(1, table.capacity)) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {hasPlainTables && (
                <ul className="cluster" style={{ listStyle: 'none' }}>
                  {STATES.filter((state) => state !== 'inactive' || counts.inactive > 0).map((state) => {
                    const Icon = TABLE_STATE_ICONS[state];
                    return (
                      <li key={state}>
                        <span className={`badge badge--${state}`}>
                          <Icon aria-hidden="true" />
                          {t.tableState[state]}: {counts[state]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

        <section className="card" aria-labelledby="overview-alerts">
          <header className="card__header">
            <h2 id="overview-alerts" className="card__title">
              {o.alertsTitle}
            </h2>
          </header>
          <div className="card__body stack">
            <AlertList alerts={alerts} />
            <p className="field__hint">{t.admin.alerts.noAutomaticChanges}</p>
          </div>
        </section>
      </div>
    </>
  );
}
