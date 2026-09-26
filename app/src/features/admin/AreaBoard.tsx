import { Lock, LogIn, Plus, Sparkles, UserCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { getAreaLoad, plannedBlockEnd, plannedServiceEnd, prepEndMs, projectedServiceEnd } from '../../domain/occupancy';
import { MINUTE_MS, parisDate, toMs } from '../../domain/time';
import type { Reservation, Table } from '../../domain/types';
import { formatTime, t } from '../../i18n';
import { useData } from '../../state/store';
import { useAdminActions } from './AdminActions';
import { placeOf } from './adminFormat';

const fl = t.admin.floor;
const sum = (list: readonly Reservation[]) => list.reduce((total, r) => total + r.partySize, 0);
const byStart = (a: Reservation, b: Reservation) => toMs(a.startAt) - toMs(b.startAt);

interface AreaBoardProps {
  areas: Table[];
  mode: 'now' | 'forecast';
  now: number;
  /** Instante consultado na previsão (null = inválido). */
  forecastMs: number | null;
  onOpenBlock: (blockId: string) => void;
}

/**
 * Lotação das áreas controladas por lugares (mesas compartilhadas): pessoas
 * agora (ou previstas no horário consultado) contra a capacidade, com quem
 * está na área, quem aguarda chegada e quem chega na próxima hora.
 */
export function AreaBoard({ areas, mode, now, forecastMs, onOpenBlock }: AreaBoardProps) {
  return (
    <section className="area-board" aria-label={fl.areasLabel}>
      {areas.map((area) => (
        <AreaCard key={area.id} area={area} mode={mode} now={now} forecastMs={forecastMs} onOpenBlock={onOpenBlock} />
      ))}
    </section>
  );
}

function AreaCard({ area, mode, now, forecastMs, onOpenBlock }: { area: Table } & Omit<AreaBoardProps, 'areas'>) {
  const data = useData();
  const actions = useAdminActions();
  const place = placeOf(data.tables, area.id);
  const today = parisDate(now);
  const atMs = mode === 'now' ? now : forecastMs;
  const titleId = `area-${area.id}-title`;

  if (!area.active || atMs === null) {
    return (
      <article className="area-card area-card--muted" aria-labelledby={titleId}>
        <header className="area-card__head">
          <h2 id={titleId} className="area-card__title">
            {place.name}
          </h2>
          <span className="badge badge--inactive">{area.active ? t.common.unavailable : fl.pill.inactive}</span>
        </header>
        <p className="subtle">{area.active ? fl.forecastPast : fl.areaInactive}</p>
      </article>
    );
  }

  const load = getAreaLoad(area, data, atMs, now);
  const { block } = load;
  const seated = [...load.seated].sort(byStart);
  const waiting = [...load.reserved].sort(byStart);
  const prep = [...load.prep].sort(byStart);
  const people = { seated: sum(seated), waiting: sum(waiting), prep: sum(prep) };
  const used = load.block ? area.capacity : Math.min(area.capacity, load.load);
  const free = Math.max(0, area.capacity - load.load);
  const over = !load.block && load.load > area.capacity;
  const nextHour =
    mode === 'now'
      ? data.reservations
          .filter(
            (r) =>
              r.tableId === area.id &&
              r.status === 'confirmed' &&
              toMs(r.startAt) > now &&
              toMs(r.startAt) <= now + 60 * MINUTE_MS &&
              parisDate(toMs(r.startAt)) === today,
          )
          .sort(byStart)
      : [];
  const pct = (value: number) => `${Math.min(100, (value / Math.max(1, area.capacity)) * 100)}%`;
  const forecast = mode === 'forecast';

  const detailsButton = (r: Reservation) => (
    <button type="button" className="area-row__name" onClick={() => actions.openReservation(r.id)}>
      {r.customer.name}
    </button>
  );

  const row = (r: Reservation, meta: ReactNode, action?: ReactNode) => (
    <li key={r.id} className="area-row">
      <span className="area-row__time num">{formatTime(toMs(r.startAt))}</span>
      <span className="area-row__body">
        {detailsButton(r)}
        <span className="area-row__meta">
          {t.common.people(r.partySize)}
          {meta ? <> · {meta}</> : null}
        </span>
      </span>
      {action}
    </li>
  );

  const list = (title: string, items: ReactNode[], empty?: string) =>
    items.length === 0 && !empty ? null : (
      <div className="area-card__group">
        <h3 className="area-card__group-title">{title}</h3>
        {items.length === 0 ? <p className="subtle">{empty}</p> : <ul className="area-list">{items}</ul>}
      </div>
    );

  const smallButton = (label: string, icon: ReactNode, onClick: () => void, primary = false) => (
    <button type="button" className={`btn btn--sm${primary ? ' btn--primary' : ''}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );

  return (
    <article className={`area-card${forecast ? ' area-card--forecast' : ''}`} aria-labelledby={titleId}>
      <header className="area-card__head">
        <div>
          <h2 id={titleId} className="area-card__title">
            {place.name}
          </h2>
          <p className="area-card__count">
            <strong className="num">{used}</strong>
            <span> {forecast ? fl.areaOfForecast(area.capacity) : fl.areaOf(area.capacity)}</span>
          </p>
        </div>
        <span className="cluster" style={{ '--cluster-gap': '0.3rem' } as React.CSSProperties}>
          {load.block ? (
            <span className="badge badge--blocked">
              <Lock aria-hidden="true" />
              {fl.pill.blocked}
            </span>
          ) : free === 0 ? (
            <span className={`badge ${over ? 'badge--warning' : 'badge--occupied'}`}>{fl.areaFull}</span>
          ) : (
            <span className="badge badge--free">{fl.areaFree(free)}</span>
          )}
          {forecast && <span className="badge badge--forecast">{fl.forecastTag}</span>}
        </span>
      </header>

      <div
        className={`area-meter${over ? ' area-meter--over' : ''}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={area.capacity}
        aria-valuenow={used}
        aria-label={fl.areaMeter(place.name, used, area.capacity)}
      >
        {load.block ? (
          <span className="area-meter__part area-meter__part--blocked" style={{ width: '100%' }} />
        ) : (
          <>
            <span className="area-meter__part area-meter__part--seated" style={{ width: pct(people.seated) }} />
            <span className="area-meter__part area-meter__part--waiting" style={{ width: pct(people.waiting) }} />
            <span className="area-meter__part area-meter__part--prep" style={{ width: pct(people.prep) }} />
          </>
        )}
      </div>
      {!load.block && (
        <p className="area-card__breakdown subtle">{fl.areaBreakdown(people.seated, people.waiting, people.prep)}</p>
      )}

      {block && (
        <div className="area-card__block">
          <p>
            <strong>{fl.areaBlocked(formatTime(toMs(block.endAt)))}</strong> · {block.reason}
          </p>
          <button type="button" className="btn btn--sm" onClick={() => onOpenBlock(block.id)}>
            <Lock aria-hidden="true" />
            {t.admin.agenda.blockDialogTitle(place)}
          </button>
        </div>
      )}

      {forecast ? (
        list(
          fl.areaForecastList,
          [...seated, ...waiting, ...prep].map((r) =>
            row(
              r,
              prep.includes(r)
                ? fl.prepUntil(formatTime(prepEndMs(r) ?? plannedBlockEnd(r)))
                : fl.areaUntil(formatTime(r.status === 'seated' ? projectedServiceEnd(r, now) : plannedServiceEnd(r))),
            ),
          ),
          fl.areaForecastNone,
        )
      ) : (
        <>
          {list(
            fl.areaSeated,
            seated.map((r) => {
              const overdue = now > plannedServiceEnd(r) ? Math.floor((now - plannedServiceEnd(r)) / MINUTE_MS) : 0;
              return row(
                r,
                <>
                  {fl.areaUntil(formatTime(plannedServiceEnd(r)))}
                  {overdue > 0 && <span className="area-row__late"> · {fl.areaOverdue(overdue)}</span>}
                </>,
                smallButton(t.admin.actions.complete, <UserCheck aria-hidden="true" />, () => actions.startAction('complete', r.id)),
              );
            }),
            fl.areaNobody,
          )}
          {list(
            fl.areaWaiting,
            waiting.map((r) =>
              row(
                r,
                now > toMs(r.startAt) ? (
                  <span className="area-row__late">{t.admin.overview.lateBadge(Math.floor((now - toMs(r.startAt)) / MINUTE_MS))}</span>
                ) : null,
                smallButton(t.admin.actions.arrive, <LogIn aria-hidden="true" />, () => actions.startAction('arrive', r.id), true),
              ),
            ),
          )}
          {list(
            fl.areaPrep,
            prep.map((r) =>
              row(
                r,
                fl.prepUntil(formatTime(prepEndMs(r) ?? now)),
                smallButton(t.admin.actions.endPrep, <Sparkles aria-hidden="true" />, () => actions.startAction('endPrep', r.id)),
              ),
            ),
          )}
          {list(
            fl.areaNextHour,
            nextHour.map((r) =>
              row(r, null, smallButton(t.admin.actions.arrive, <LogIn aria-hidden="true" />, () => actions.startAction('arrive', r.id))),
            ),
            fl.areaNoNext,
          )}
          <div className="area-card__actions">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => actions.createReservation({ tableId: area.id, date: today, source: 'walk_in' })}
            >
              <Plus aria-hidden="true" />
              {fl.walkIn}
            </button>
            <Link to="/admin/configuracoes#bloqueios" className="btn btn--sm btn--ghost">
              <Lock aria-hidden="true" />
              {fl.blockArea}
            </Link>
          </div>
        </>
      )}
    </article>
  );
}
