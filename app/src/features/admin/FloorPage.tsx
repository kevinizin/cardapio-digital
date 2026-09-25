import { ArrowLeftRight, CalendarDays, Hourglass, Lock, LogIn, Plus, Sparkles, UserCheck } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { TABLE_STATE_ICONS, TableStateBadge } from '../../components/Badges';
import { DateField, TimeSelect, timeOptions } from '../../components/DateField';
import { Notice } from '../../components/Feedback';
import { useDocumentTitle } from '../../components/PageLoading';
import { plannedServiceEnd, getForecastTableStatus, getLiveTableStatus, type LiveTableState } from '../../domain/occupancy';
import { currentOrNextShift } from '../../domain/schedule';
import { localToMs, MINUTE_MS, parisDate, parisTime, toMs } from '../../domain/time';
import type { Reservation, Table, TableBlock } from '../../domain/types';
import { formatLocalDate, formatLocalDateCompact, formatTime, t } from '../../i18n';
import { useData, useNow } from '../../state/store';
import { useAdminActions } from './AdminActions';
import { PageHead } from './AdminLayout';
import { BlockDialog } from './BlockDialog';
import './floor.css';

const fl = t.admin.floor;
const STATES: LiveTableState[] = ['free', 'reserved', 'occupied', 'prep', 'blocked', 'inactive'];

/** Posições no mapa (unidades de um quadro 1000 × 640). */
const LAYOUT: Record<string, { x: number; y: number }> = {
  M01: { x: 95, y: 118 },
  M02: { x: 215, y: 118 },
  M03: { x: 335, y: 118 },
  M04: { x: 455, y: 118 },
  M05: { x: 140, y: 320 },
  M06: { x: 335, y: 320 },
  M07: { x: 140, y: 505 },
  M08: { x: 335, y: 505 },
  M09: { x: 760, y: 165 },
  M10: { x: 900, y: 165 },
  M11: { x: 760, y: 440 },
  M12: { x: 900, y: 440 },
};

/** Colunas e faixa vertical livres em cada área do quadro (fora do bar, cozinha e entrada). */
const AREA_GRID: Record<Table['area'], { columns: number[]; top: number; bottom: number }> = {
  salao: { columns: [95, 215, 335, 455], top: 118, bottom: 520 },
  varanda: { columns: [760, 900], top: 150, bottom: 520 },
};

/**
 * Usa o desenho fixo quando todas as mesas são as do desenho; senão, distribui
 * as mesas de cada área em grade, na ordem da identificação.
 */
export function floorPositions(tables: Table[]): Record<string, { x: number; y: number }> {
  if (tables.every((table) => LAYOUT[table.id] && table.area === (Number(table.id.slice(1)) <= 8 ? 'salao' : 'varanda'))) {
    return LAYOUT;
  }
  const positions: Record<string, { x: number; y: number }> = {};
  for (const area of ['salao', 'varanda'] as const) {
    const { columns, top, bottom } = AREA_GRID[area];
    const inArea = tables.filter((table) => table.area === area).sort((a, b) => a.id.localeCompare(b.id, 'pt-BR', { numeric: true }));
    const rows = Math.max(1, Math.ceil(inArea.length / columns.length));
    const step = rows > 1 ? (bottom - top) / (rows - 1) : 0;
    inArea.forEach((table, index) => {
      positions[table.id] = { x: columns[index % columns.length], y: top + Math.floor(index / columns.length) * step };
    });
  }
  return positions;
}

function shapeOf(capacity: number) {
  if (capacity <= 2) return { w: 70, h: 70, round: true };
  if (capacity <= 4) return { w: 88, h: 88, round: false };
  return { w: 84, h: 130, round: false };
}

interface TableView {
  table: Table;
  state: LiveTableState | null;
  reservation?: Reservation;
  block?: TableBlock;
  until?: number;
  overdue?: boolean;
}

function FloorBackground() {
  return (
    <svg className="floor-bg" viewBox="0 0 1000 640" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <pattern id="awning" width="40" height="30" patternUnits="userSpaceOnUse">
          <rect width="20" height="30" className="floor-bg__awning-a" />
          <rect x="20" width="20" height="30" className="floor-bg__awning-b" />
        </pattern>
      </defs>
      <rect x="8" y="8" width="636" height="624" rx="10" className="floor-bg__room" />
      <line x1="40" y1="12" x2="520" y2="12" className="floor-bg__window" />
      <rect x="660" y="8" width="332" height="624" rx="10" className="floor-bg__terrace" />
      <rect x="664" y="12" width="324" height="26" fill="url(#awning)" className="floor-bg__awning" />
      <rect x="520" y="200" width="96" height="240" rx="10" className="floor-bg__bar" />
      <text x="568" y="325" className="floor-bg__label floor-bg__label--small" textAnchor="middle">
        {fl.bar}
      </text>
      <rect x="540" y="14" width="100" height="56" rx="6" className="floor-bg__kitchen" />
      <text x="590" y="48" className="floor-bg__label floor-bg__label--small" textAnchor="middle">
        {fl.kitchen}
      </text>
      <line x1="480" y1="632" x2="600" y2="632" className="floor-bg__door" />
      <text x="540" y="614" className="floor-bg__label floor-bg__label--small" textAnchor="middle">
        {fl.entrance}
      </text>
      <text x="36" y="600" className="floor-bg__label">
        {fl.salao}
      </text>
      <text x="826" y="610" className="floor-bg__label" textAnchor="middle">
        {fl.varanda}
      </text>
    </svg>
  );
}

export function FloorPage() {
  useDocumentTitle(fl.documentTitle);
  const data = useData();
  const now = useNow(15_000);
  const actions = useAdminActions();
  const today = parisDate(now);
  const { settings } = data;

  const positions = useMemo(() => floorPositions(data.tables), [data.tables]);
  const [mode, setMode] = useState<'now' | 'forecast'>('now');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [forecastDate, setForecastDate] = useState(() => {
    const next = currentOrNextShift(settings, now);
    return next ? next.shift.date : today;
  });
  const [forecastTime, setForecastTime] = useState(() => {
    const next = currentOrNextShift(settings, now);
    if (!next) return '20:00';
    const target = next.isCurrent ? Math.ceil((now + 60 * MINUTE_MS) / (15 * MINUTE_MS)) * 15 * MINUTE_MS : next.shift.startMs + 60 * MINUTE_MS;
    return parisTime(target);
  });

  const forecastMs = forecastDate && forecastTime ? localToMs(forecastDate, forecastTime) : null;
  const forecastValid = forecastMs !== null && forecastMs >= now;
  const shiftInfo = currentOrNextShift(settings, now);

  const views: TableView[] = useMemo(
    () =>
      data.tables.map((table) => {
        if (mode === 'now') {
          const live = getLiveTableStatus(table, data, now);
          return { table, state: live.state, reservation: live.reservation, block: live.block, until: live.until, overdue: live.overdue };
        }
        if (!forecastValid || forecastMs === null) return { table, state: null };
        const forecast = getForecastTableStatus(table, data, forecastMs, now);
        return { table, state: forecast.state, reservation: forecast.reservation, block: forecast.block, until: forecast.segment?.end };
      }),
    [data, now, mode, forecastMs, forecastValid],
  );

  const counts = STATES.map((state) => ({ state, count: views.filter((view) => view.state === state).length }));
  const selected = views.find((view) => view.table.id === selectedId) ?? null;
  const nextToday = selected
    ? data.reservations
        .filter((r) => r.tableId === selected.table.id && r.status === 'confirmed' && toMs(r.startAt) > now && parisDate(toMs(r.startAt)) === today)
        .sort((a, b) => toMs(a.startAt) - toMs(b.startAt))
    : [];

  const panelDetails = () => {
    if (!selected) return <p className="subtle">{fl.panelEmpty}</p>;
    const { table, state, reservation: r, block, until, overdue } = selected;
    if (!table.active) return <Notice tone="neutral">{fl.inactiveInfo}</Notice>;
    if (mode === 'forecast') {
      if (!state) return <Notice tone="warning">{fl.forecastPast}</Notice>;
      return (
        <div className="stack">
          {state === 'free' && <p>{fl.forecastFree}</p>}
          {r && (
            <p>
              {fl.forecastItem(r.customer.name, t.common.people(r.partySize), `${formatTime(toMs(r.startAt))}–${formatTime(plannedServiceEnd(r))}`)}
            </p>
          )}
          {block && <p>{block.reason}</p>}
          <div className="drawer-actions">
            {r && (
              <button type="button" className="btn" onClick={() => actions.openReservation(r.id)}>
                {t.admin.actions.details}
              </button>
            )}
            {block && (
              <button type="button" className="btn" onClick={() => setBlockId(block.id)}>
                <Lock aria-hidden="true" />
                {t.admin.agenda.blockDialogTitle(table.id)}
              </button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="stack">
        {state === 'occupied' && r && (
          <>
            <p className="notice__title">{fl.seatedInfo(r.customer.name, t.common.people(r.partySize))}</p>
            <p className="muted">
              {r.seatedAt && fl.since(formatTime(toMs(r.seatedAt)))} · {fl.expectedEnd(formatTime(plannedServiceEnd(r)))}
            </p>
            {overdue && <Notice tone="warning">{fl.overdue(Math.floor((now - plannedServiceEnd(r)) / MINUTE_MS))}</Notice>}
            <div className="drawer-actions">
              <button type="button" className="btn btn--primary" onClick={() => actions.startAction('complete', r.id)}>
                <UserCheck aria-hidden="true" />
                {t.admin.actions.complete}
              </button>
              <button type="button" className="btn" onClick={() => actions.startAction('changeTable', r.id)}>
                <ArrowLeftRight aria-hidden="true" />
                {t.admin.actions.changeTable}
              </button>
            </div>
          </>
        )}
        {state === 'prep' && r && until && (
          <>
            <p className="notice__title">{fl.prepUntil(formatTime(until))}</p>
            <div className="drawer-actions">
              <button type="button" className="btn btn--primary" onClick={() => actions.startAction('endPrep', r.id)}>
                <Sparkles aria-hidden="true" />
                {t.admin.actions.endPrep}
              </button>
              <button type="button" className="btn" onClick={() => actions.startAction('extendPrep', r.id)}>
                <Hourglass aria-hidden="true" />
                {t.admin.actions.extendPrep}
              </button>
            </div>
          </>
        )}
        {state === 'blocked' && block && until && (
          <>
            <p className="notice__title">{fl.blockedUntil(formatTime(until))}</p>
            <p className="muted">{block.reason}</p>
            <button type="button" className="btn" onClick={() => setBlockId(block.id)} style={{ justifySelf: 'start' }}>
              <Lock aria-hidden="true" />
              {t.admin.agenda.blockDialogTitle(table.id)}
            </button>
          </>
        )}
        {state === 'reserved' && r && (
          <>
            <p className="notice__title">{fl.reservedAt(formatTime(toMs(r.startAt)), r.customer.name, t.common.people(r.partySize))}</p>
            <div className="drawer-actions">
              <button type="button" className="btn btn--primary" onClick={() => actions.startAction('arrive', r.id)}>
                <LogIn aria-hidden="true" />
                {t.admin.actions.arrive}
              </button>
            </div>
          </>
        )}
        {state === 'free' && (
          <>
            <p>{fl.freeNow}</p>
            <div className="drawer-actions">
              <button type="button" className="btn" onClick={() => actions.createReservation({ tableId: table.id, date: today, source: 'walk_in' })}>
                <Plus aria-hidden="true" />
                {t.admin.actions.newReservation}
              </button>
              <Link to="/admin/configuracoes#bloqueios" className="btn">
                <Lock aria-hidden="true" />
                {fl.blockTable}
              </Link>
            </div>
          </>
        )}
        {r && (
          <button type="button" className="btn btn--ghost btn--sm" style={{ justifySelf: 'start' }} onClick={() => actions.openReservation(r.id)}>
            {t.admin.actions.details}
          </button>
        )}
        <div className="stack" style={{ '--stack-gap': '0.4rem' } as React.CSSProperties}>
          <h3 className="drawer-section__title">{fl.nextToday}</h3>
          {nextToday.length === 0 ? (
            <p className="subtle">{fl.noNext}</p>
          ) : (
            <ul className="conflict-list">
              {nextToday.slice(0, 5).map((next) => (
                <li key={next.id}>
                  <span>
                    <strong className="num">{formatTime(toMs(next.startAt))}</strong> · {next.customer.name} · {t.common.people(next.partySize)}
                  </span>
                  <button type="button" className="btn btn--sm" onClick={() => actions.openReservation(next.id)}>
                    {t.admin.actions.details}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHead
        title={fl.title}
        description={fl.subtitle}
        actions={
          <Link to="/admin/agenda" className="btn">
            <CalendarDays aria-hidden="true" />
            {t.admin.actions.openAgenda}
          </Link>
        }
      />

      <div className="adm-toolbar">
        <div className="adm-toolbar__group" role="radiogroup" aria-labelledby="floor-mode-label">
          <span className="adm-toolbar__label" id="floor-mode-label">
            {fl.mode}
          </span>
          <div className="segmented">
            <label className="segmented__option">
              <input type="radio" name="floor-mode" checked={mode === 'now'} onChange={() => setMode('now')} />
              <span>{fl.modeNow}</span>
            </label>
            <label className="segmented__option">
              <input type="radio" name="floor-mode" checked={mode === 'forecast'} onChange={() => setMode('forecast')} />
              <span>{fl.modeForecast}</span>
            </label>
          </div>
        </div>
        {mode === 'forecast' && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="floor-date">
                {fl.forecastDate}
              </label>
              <DateField id="floor-date" value={forecastDate} onChange={setForecastDate} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="floor-time">
                {fl.forecastTime}
              </label>
              <TimeSelect id="floor-time" value={forecastTime} onChange={setForecastTime} options={timeOptions(0, 23 * 60 + 45, 15)} />
            </div>
          </>
        )}
      </div>

      {mode === 'now' ? (
        <Notice tone="neutral" role="status">
          {shiftInfo?.isCurrent
            ? fl.nowBanner(formatTime(now))
            : fl.closedNow(
                shiftInfo ? t.admin.overview.nextShift(`${formatLocalDateCompact(shiftInfo.shift.date)} às ${formatTime(shiftInfo.shift.startMs)}`) : '',
              )}
        </Notice>
      ) : forecastValid && forecastMs !== null ? (
        <Notice tone="warning" role="status" title={t.admin.floor.modeForecast}>
          {fl.forecastBanner(formatLocalDate(forecastDate), forecastTime)}
        </Notice>
      ) : (
        <Notice tone="warning" role="status">
          {fl.forecastPast}
        </Notice>
      )}

      <ul className="floor-counts" aria-label={fl.countsLabel}>
        {counts
          .filter(({ state, count }) => state !== 'inactive' || count > 0)
          .map(({ state, count }) => {
            const Icon = TABLE_STATE_ICONS[state];
            return (
              <li key={state}>
                <span className={`badge badge--${state}${mode === 'forecast' ? ' badge--dashed' : ''}`}>
                  <Icon aria-hidden="true" />
                  {t.tableState[state]}: {count}
                </span>
              </li>
            );
          })}
      </ul>

      <div className="floor-layout">
        <section className="floor-card" aria-label={fl.mapLabel}>
          <div className="floor-scroll">
            <div className={`floor-map${mode === 'forecast' ? ' floor-map--forecast' : ''}`}>
              <FloorBackground />
              {views.map((view) => {
                const position = positions[view.table.id] ?? { x: 500, y: 320 };
                const shape = shapeOf(view.table.capacity);
                const stateKey = view.state ?? 'neutral';
                const Icon = view.state ? TABLE_STATE_ICONS[view.state] : null;
                const chairs = Math.min(view.table.capacity, 12);
                return (
                  <button
                    key={view.table.id}
                    type="button"
                    className={`floor-table floor-table--${stateKey}`}
                    style={{ left: `${position.x / 10}%`, top: `${(position.y / 640) * 100}%` } as React.CSSProperties}
                    aria-pressed={selectedId === view.table.id}
                    aria-label={fl.tableButton(
                      view.table.id,
                      view.table.capacity,
                      view.state ? t.tableState[view.state] : t.common.unavailable,
                      mode === 'forecast',
                    )}
                    onClick={() => {
                      setSelectedId(view.table.id);
                      // Com o painel abaixo do mapa (telas menores), leva os detalhes para a vista.
                      if (window.matchMedia('(max-width: 1360px)').matches) {
                        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                        requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }));
                      }
                    }}
                  >
                    <span
                      className={`floor-table__shape${shape.round ? ' is-round' : ''}`}
                      style={{ '--w': shape.w, '--h': shape.h } as React.CSSProperties}
                    >
                      {Array.from({ length: chairs }, (_, index) => {
                        const angle = (index / chairs) * Math.PI * 2 - Math.PI / 2;
                        const rx = 50 + Math.cos(angle) * (50 + (14 / shape.w) * 100);
                        const ry = 50 + Math.sin(angle) * (50 + (14 / shape.h) * 100);
                        return <span key={index} className="floor-table__chair" style={{ left: `${rx}%`, top: `${ry}%` }} aria-hidden="true" />;
                      })}
                      <span className="floor-table__id">{view.table.id}</span>
                      <span className="floor-table__cap">{view.table.capacity}p</span>
                    </span>
                    <span className="floor-table__state" aria-hidden="true">
                      {Icon && <Icon />}
                      {view.state ? fl.pill[view.state] : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <ul className="floor-legend" aria-label={fl.legendTitle}>
            {STATES.map((state) => (
              <li key={state}>
                <TableStateBadge state={state} />
              </li>
            ))}
          </ul>
        </section>

        <aside className="floor-card floor-panel" aria-live="polite" ref={panelRef}>
          {selected ? (
            <div className="stack">
              <div className="cluster" style={{ justifyContent: 'space-between' }}>
                <div>
                  <h2 className="card__title">{fl.panelTitle(selected.table.id)}</h2>
                  <p className="subtle">{fl.panelMeta(selected.table.capacity, t.area[selected.table.area])}</p>
                </div>
                {selected.state && (
                  <span className="cluster" style={{ '--cluster-gap': '0.3rem' } as React.CSSProperties}>
                    <TableStateBadge state={selected.state} forecast={mode === 'forecast'} />
                    {mode === 'forecast' && <span className="badge badge--forecast">{fl.forecastTag}</span>}
                  </span>
                )}
              </div>
              {panelDetails()}
            </div>
          ) : (
            panelDetails()
          )}
        </aside>
      </div>

      {blockId && <BlockDialog blockId={blockId} onClose={() => setBlockId(null)} />}
    </>
  );
}
