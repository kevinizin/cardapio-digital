import { CalendarDays, List, Lock, LogIn, Moon, Plus, Sparkles, Sun, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RESERVATION_STATUS_ICONS, ReservationStatusBadge, SourceLabel } from '../../components/Badges';
import { DayNavigator } from '../../components/DateField';
import { EmptyState, Notice } from '../../components/Feedback';
import { useDocumentTitle } from '../../components/PageLoading';
import { intersect, subtractIntervals } from '../../domain/intervals';
import { isPrepActive } from '../../domain/lifecycle';
import { blockSegment, isSharedTable, peakLoad, reservationSegments, segmentsForTable, type OccupancySegment } from '../../domain/occupancy';
import { findException, getShiftsForDate } from '../../domain/schedule';
import { dayBounds, HOUR_MS, MINUTE_MS, parisDate, toMs } from '../../domain/time';
import { RESERVATION_STATUSES, type Area, type Interval, type Reservation, type ReservationStatus, type ShiftKind, type Table } from '../../domain/types';
import { formatTime, t } from '../../i18n';
import { useData, useNow } from '../../state/store';
import { useAdminActions } from './AdminActions';
import { PageHead } from './AdminLayout';
import { allShared, placeLabel } from './adminFormat';
import { BlockDialog } from './BlockDialog';
import './agenda.css';

const ag = t.admin.agenda;

interface TimelineItem {
  key: string;
  segment: OccupancySegment | (Interval & { kind: 'released'; reservationId: string });
  reservation?: Reservation;
}

/** Altura de cada sub-linha de uma área compartilhada (rem). */
const LANE_REM = 1.85;
/** Fatias do indicador de lotação (min). */
const LOAD_SLOT_MINUTES = 30;

/**
 * Empilha reservas que se sobrepõem numa área em sub-linhas (primeira linha
 * livre, em ordem de início). Atendimento e preparação da mesma reserva ficam
 * na mesma sub-linha; bloqueios ocupam a área inteira e ficam fora do empilhamento.
 */
export function packLanes(items: readonly TimelineItem[]): { lanes: number; laneOf: Map<string, number> } {
  const groups = new Map<string, Interval>();
  for (const item of items) {
    if (!item.reservation) continue;
    const id = item.reservation.id;
    const current = groups.get(id);
    groups.set(id, current ? { start: Math.min(current.start, item.segment.start), end: Math.max(current.end, item.segment.end) } : { start: item.segment.start, end: item.segment.end });
  }
  const ends: number[] = [];
  const laneOf = new Map<string, number>();
  for (const [id, interval] of [...groups.entries()].sort((a, b) => a[1].start - b[1].start || a[0].localeCompare(b[0]))) {
    let lane = ends.findIndex((end) => end <= interval.start);
    if (lane === -1) {
      lane = ends.length;
      ends.push(interval.end);
    } else ends[lane] = interval.end;
    laneOf.set(id, lane);
  }
  return { lanes: Math.max(1, ends.length), laneOf };
}

export function AgendaPage() {
  useDocumentTitle(ag.documentTitle);
  const data = useData();
  const now = useNow(30_000);
  const actions = useAdminActions();
  const today = parisDate(now);
  const { settings } = data;

  const [date, setDate] = useState(today);
  const [shift, setShift] = useState<'all' | ShiftKind>('all');
  const [area, setArea] = useState<'all' | Area>('all');
  const [statuses, setStatuses] = useState<Set<ReservationStatus>>(() => new Set(['confirmed', 'seated', 'completed', 'no_show']));
  const [view, setView] = useState<'timeline' | 'list'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'timeline',
  );
  const [blockId, setBlockId] = useState<string | null>(null);

  const shifts = getShiftsForDate(settings, date);
  const exception = findException(settings, date);
  const visibleShifts = shifts.filter((s) => shift === 'all' || s.kind === shift);
  const bounds = dayBounds(date);

  const shiftKindOf = (r: Reservation): ShiftKind => {
    const start = toMs(r.startAt);
    const match = shifts.find((s) => start >= s.startMs && start < s.endMs);
    if (match) return match.kind;
    return new Date(start).getTime() < bounds.startMs + 17 * HOUR_MS ? 'lunch' : 'dinner';
  };
  const areaOf = (tableId: string) => data.tables.find((tb) => tb.id === tableId)?.area;

  const dayReservations = useMemo(
    () =>
      data.reservations
        .filter((r) => parisDate(toMs(r.startAt)) === date)
        .sort((a, b) => toMs(a.startAt) - toMs(b.startAt) || a.tableId.localeCompare(b.tableId)),
    [data, date],
  );
  const filtered = dayReservations.filter(
    (r) => statuses.has(r.status) && (shift === 'all' || shiftKindOf(r) === shift) && (area === 'all' || areaOf(r.tableId) === area),
  );
  const countable = dayReservations.filter((r) => r.status !== 'cancelled');
  const people = countable.filter((r) => r.status !== 'no_show').reduce((sum, r) => sum + r.partySize, 0);
  const tables = data.tables.filter((tb) => area === 'all' || tb.area === area);

  // Janela da linha do tempo: turnos visíveis com folga, ampliada para segmentos fora deles.
  const items = useMemo(() => {
    const byTable = new Map<string, TimelineItem[]>();
    const push = (tableId: string, item: TimelineItem) => {
      const list = byTable.get(tableId);
      if (list) list.push(item);
      else byTable.set(tableId, [item]);
    };
    for (const r of filtered) {
      if (r.status === 'cancelled' || r.status === 'no_show') {
        const start = toMs(r.startAt);
        push(r.tableId, { key: `${r.id}-released`, segment: { kind: 'released', reservationId: r.id, start, end: start + r.serviceMinutes * MINUTE_MS }, reservation: r });
        continue;
      }
      reservationSegments(r, now).forEach((segment, index) => push(r.tableId, { key: `${r.id}-${index}`, segment, reservation: r }));
    }
    for (const block of data.blocks) {
      const segment = blockSegment(block);
      const piece = intersect(segment, { start: bounds.startMs, end: bounds.endMs });
      if (piece) push(block.tableId, { key: block.id, segment: { ...segment, ...piece } });
    }
    return byTable;
  }, [filtered, data.blocks, now, bounds.startMs, bounds.endMs]);

  const windowRange = useMemo(() => {
    let start = visibleShifts.length ? Math.min(...visibleShifts.map((s) => s.startMs)) - 30 * MINUTE_MS : bounds.startMs + 11 * HOUR_MS;
    let end = visibleShifts.length ? Math.max(...visibleShifts.map((s) => s.endMs)) + 30 * MINUTE_MS : bounds.startMs + 23 * HOUR_MS;
    for (const list of items.values()) {
      for (const item of list) {
        if (shift !== 'all' && item.reservation && shiftKindOf(item.reservation) !== shift) continue;
        if (!item.reservation && shift !== 'all') continue;
        start = Math.min(start, item.segment.start);
        end = Math.max(end, item.segment.end);
      }
    }
    start = Math.max(bounds.startMs, Math.floor(start / HOUR_MS) * HOUR_MS);
    end = Math.min(bounds.endMs, Math.ceil(end / HOUR_MS) * HOUR_MS);
    return { start, end };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, visibleShifts, bounds.startMs, bounds.endMs, shift]);

  const span = windowRange.end - windowRange.start;
  const pct = (ms: number) => ((Math.min(Math.max(ms, windowRange.start), windowRange.end) - windowRange.start) / span) * 100;
  const hours = Math.round(span / HOUR_MS);
  const ticks = Array.from({ length: hours + 1 }, (_, i) => windowRange.start + i * HOUR_MS);
  const closedBands = subtractIntervals([windowRange], visibleShifts.map((s) => ({ start: s.startMs, end: s.endMs })));
  const showNow = date === today && now >= windowRange.start && now <= windowRange.end;
  const onlyAreas = allShared(data.tables);

  // Lotação por fatia de horário em cada área (todas as reservas que ocupam lugares, sem filtros).
  const loadSlots = useMemo(() => {
    const map = new Map<string, { start: number; end: number; load: number }[]>();
    const slotMs = LOAD_SLOT_MINUTES * MINUTE_MS;
    for (const table of data.tables) {
      if (!isSharedTable(table)) continue;
      const segments = segmentsForTable(data, table.id, now, { relevantFrom: windowRange.start });
      const slots = [];
      for (let start = windowRange.start; start < windowRange.end; start += slotMs) {
        const slot = { start, end: Math.min(windowRange.end, start + slotMs) };
        slots.push({ ...slot, load: peakLoad(segments, slot, table.capacity) });
      }
      map.set(table.id, slots);
    }
    return map;
  }, [data, now, windowRange.start, windowRange.end]);

  const toggleStatus = (status: ReservationStatus) =>
    setStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  const quickAction = (r: Reservation) => {
    if (r.status === 'confirmed') {
      return (
        <button type="button" className="btn btn--sm btn--primary" onClick={() => actions.startAction('arrive', r.id)}>
          <LogIn aria-hidden="true" />
          {t.admin.actions.arrive}
        </button>
      );
    }
    if (r.status === 'seated') {
      return (
        <button type="button" className="btn btn--sm btn--primary" onClick={() => actions.startAction('complete', r.id)}>
          <UserCheck aria-hidden="true" />
          {t.admin.actions.complete}
        </button>
      );
    }
    if (r.status === 'completed' && isPrepActive(r, now)) {
      return (
        <button type="button" className="btn btn--sm" onClick={() => actions.startAction('endPrep', r.id)}>
          <Sparkles aria-hidden="true" />
          {t.admin.actions.endPrep}
        </button>
      );
    }
    return null;
  };

  const segmentButton = (item: TimelineItem, lane?: number) => {
    const { segment, reservation } = item;
    const range = `${formatTime(segment.start)}–${formatTime(segment.end)}`;
    const style: React.CSSProperties = { left: `${pct(segment.start)}%`, width: `${Math.max(0.4, pct(segment.end) - pct(segment.start))}%` };
    if (lane !== undefined) {
      style.top = `${0.3 + lane * LANE_REM}rem`;
      style.bottom = 'auto';
      style.height = `${LANE_REM - 0.25}rem`;
    }
    if (segment.kind === 'block') {
      const block = data.blocks.find((b) => b.id === (segment as OccupancySegment).blockId);
      return (
        <button key={item.key} type="button" className="tl-seg tl-seg--block" style={style} title={block?.reason} aria-label={ag.segmentBlock(range, block?.reason ?? '')} onClick={() => block && setBlockId(block.id)}>
          <Lock aria-hidden="true" />
          <span>{block?.reason}</span>
        </button>
      );
    }
    if (!reservation) return null;
    const open = () => actions.openReservation(reservation.id);
    if (segment.kind === 'prep') {
      return (
        <button
          key={item.key}
          type="button"
          className={`tl-seg tl-seg--prep${(segment as OccupancySegment).basis === 'projected' ? ' is-projected' : ''}`}
          style={style}
          title={ag.segmentPrep(range)}
          aria-label={ag.segmentPrep(range)}
          onClick={open}
        >
          <Sparkles aria-hidden="true" />
        </button>
      );
    }
    const label = ag.segmentService(reservation.customer.name, t.common.people(reservation.partySize), range, t.reservationStatus[reservation.status]);
    const variant = segment.kind === 'released' ? 'tl-seg--released' : `tl-seg--service is-${reservation.status}`;
    return (
      <button key={item.key} type="button" className={`tl-seg ${variant}`} style={style} title={label} aria-label={label} onClick={open}>
        <span>
          <span className="num">{formatTime(toMs(reservation.startAt))}</span> {reservation.customer.name} ({reservation.partySize})
        </span>
      </button>
    );
  };

  const trackBackground = () => (
    <>
      {closedBands.map((band) => (
        <span key={band.start} className="timeline__closed" style={{ left: `${pct(band.start)}%`, width: `${pct(band.end) - pct(band.start)}%` }} aria-hidden="true" />
      ))}
      {ticks.map((tick) => (
        <span key={tick} className="timeline__hour" style={{ left: `${pct(tick)}%` }} aria-hidden="true" />
      ))}
    </>
  );

  /** Área compartilhada: reservas empilhadas em sub-linhas + faixa de lotação por horário. */
  const sharedRows = (table: Table) => {
    const visible = (items.get(table.id) ?? []).filter((item) => item.segment.end > windowRange.start && item.segment.start < windowRange.end);
    const { lanes, laneOf } = packLanes(visible);
    const slots = loadSlots.get(table.id) ?? [];
    const peak = slots.reduce((best, slot) => (slot.load > best.load ? slot : best), { start: 0, end: 0, load: -1 });
    const areaName = t.area[table.area];
    return (
      <div className="timeline__area" key={table.id}>
        <div className="timeline__row timeline__row--area">
          <div className="timeline__label">
            <strong>{areaName}</strong>
            <span>{ag.areaCapacity(table.capacity)}</span>
          </div>
          <div className="timeline__track" style={{ minHeight: `${0.35 + lanes * LANE_REM}rem` }}>
            {trackBackground()}
            {visible.map((item) => (item.reservation ? segmentButton(item, laneOf.get(item.reservation.id) ?? 0) : segmentButton(item)))}
            {showNow && <span className="timeline__now" style={{ left: `${pct(now)}%` }} aria-hidden="true" />}
          </div>
        </div>
        <div className="timeline__row timeline__row--load">
          <div className="timeline__label">
            <span>{ag.loadRow}</span>
            {peak.load > 0 && <span className="num">{ag.loadPeak(peak.load, table.capacity, formatTime(peak.start))}</span>}
          </div>
          <div className="timeline__track" role="list" aria-label={ag.loadLabel(areaName)}>
            {trackBackground()}
            {slots.map((slot) => {
              const ratio = slot.load / Math.max(1, table.capacity);
              const level = ratio >= 1 ? 'full' : ratio >= 0.75 ? 'high' : ratio > 0 ? 'some' : 'none';
              const text = ag.loadCell(formatTime(slot.start), slot.load, table.capacity);
              return (
                <span
                  key={slot.start}
                  role="listitem"
                  className={`tl-load tl-load--${level}`}
                  style={{ left: `${pct(slot.start)}%`, width: `${pct(slot.end) - pct(slot.start)}%` }}
                  title={text}
                  aria-label={text}
                >
                  <span className="tl-load__bar" style={{ height: `${Math.min(100, ratio * 100)}%` }} aria-hidden="true" />
                  {slot.load > 0 && <span className="tl-load__value num" aria-hidden="true">{slot.load}</span>}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const groups = (shift === 'all' ? (['lunch', 'dinner'] as ShiftKind[]) : [shift]).map((kind) => ({
    kind,
    shift: shifts.find((s) => s.kind === kind),
    reservations: filtered.filter((r) => shiftKindOf(r) === kind),
  }));

  return (
    <>
      <PageHead
        title={ag.title}
        description={ag.subtitle}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => actions.createReservation({ date })}>
            <Plus aria-hidden="true" />
            {t.admin.actions.newReservation}
          </button>
        }
      />

      <div className="adm-toolbar">
        <div className="adm-toolbar__group">
          <span className="adm-toolbar__label">{ag.day}</span>
          <DayNavigator id="agenda-date" value={date} today={today} onChange={setDate} />
        </div>
        <div className="adm-toolbar__group" role="radiogroup" aria-labelledby="agenda-shift-label">
          <span className="adm-toolbar__label" id="agenda-shift-label">
            {ag.shift}
          </span>
          <div className="segmented">
            {(['all', 'lunch', 'dinner'] as const).map((value) => (
              <label className="segmented__option" key={value}>
                <input type="radio" name="agenda-shift" checked={shift === value} onChange={() => setShift(value)} />
                <span>{value === 'all' ? ag.allShifts : t.shift[value]}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="agenda-area">
            {ag.area}
          </label>
          <select id="agenda-area" className="select" value={area} onChange={(event) => setArea(event.target.value as 'all' | Area)}>
            <option value="all">{ag.allAreas}</option>
            <option value="salao">{t.area.salao}</option>
            <option value="varanda">{t.area.varanda}</option>
          </select>
        </div>
        <div className="adm-toolbar__group" role="radiogroup" aria-labelledby="agenda-view-label">
          <span className="adm-toolbar__label" id="agenda-view-label">
            {ag.view}
          </span>
          <div className="segmented">
            <label className="segmented__option">
              <input type="radio" name="agenda-view" checked={view === 'timeline'} onChange={() => setView('timeline')} />
              <span>
                <CalendarDays aria-hidden="true" />
                {ag.viewTimeline}
              </span>
            </label>
            <label className="segmented__option">
              <input type="radio" name="agenda-view" checked={view === 'list'} onChange={() => setView('list')} />
              <span>
                <List aria-hidden="true" />
                {ag.viewList}
              </span>
            </label>
          </div>
        </div>
        <div className="adm-toolbar__group" role="group" aria-labelledby="agenda-status-label" style={{ flexBasis: '100%' }}>
          <span className="adm-toolbar__label" id="agenda-status-label">
            {ag.status}
          </span>
          <div className="cluster">
            {RESERVATION_STATUSES.map((status) => {
              const Icon = RESERVATION_STATUS_ICONS[status];
              return (
                <button key={status} type="button" className="chip" aria-pressed={statuses.has(status)} onClick={() => toggleStatus(status)}>
                  <Icon aria-hidden="true" />
                  {t.reservationStatus[status]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="agenda-summary">
        <strong>{ag.summary(t.common.reservations(countable.length), t.common.people(people))}</strong>
        {shifts.length > 0 ? (
          <span>{ag.shiftsOfDay(shifts.map((s) => `${t.shift[s.kind]} ${s.start}–${s.end}`).join(' · '))}</span>
        ) : (
          <span className="badge badge--cancelled">{exception?.note ? ag.closedWithNote(exception.note) : ag.closed}</span>
        )}
      </p>

      {view === 'timeline' ? (
        <>
          <section className="timeline" aria-label={ag.timelineLabel}>
            <p className="timeline__hint">{ag.scrollHint}</p>
            <div className="timeline__scroll">
              <div className="timeline__grid" style={{ '--tl-hours': hours } as React.CSSProperties}>
                <div className="timeline__header" aria-hidden="true">
                  <div className="timeline__corner">{onlyAreas ? ag.areaCorner : t.common.table}</div>
                  <div className="timeline__axis">
                    {ticks.map((tick) => (
                      <span key={tick} className="timeline__tick num" style={{ left: `${pct(tick)}%` }}>
                        {formatTime(tick)}
                      </span>
                    ))}
                  </div>
                </div>
                {tables.map((table) =>
                  isSharedTable(table) ? (
                    sharedRows(table)
                  ) : (
                    <div className="timeline__row" key={table.id}>
                      <div className="timeline__label">
                        <strong>{table.id}</strong>
                        <span>
                          {t.common.seats(table.capacity)} · {t.area[table.area]}
                        </span>
                      </div>
                      <div className="timeline__track">
                        {closedBands.map((band) => (
                          <span key={band.start} className="timeline__closed" style={{ left: `${pct(band.start)}%`, width: `${pct(band.end) - pct(band.start)}%` }} aria-hidden="true" />
                        ))}
                        {ticks.map((tick) => (
                          <span key={tick} className="timeline__hour" style={{ left: `${pct(tick)}%` }} aria-hidden="true" />
                        ))}
                        {(items.get(table.id) ?? [])
                          .filter((item) => item.segment.end > windowRange.start && item.segment.start < windowRange.end)
                          .map(segmentButton)}
                        {showNow && <span className="timeline__now" style={{ left: `${pct(now)}%` }} aria-hidden="true" />}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          </section>
          <ul className="timeline-legend" aria-label={ag.legendTitle}>
            <li><span className="legend-swatch legend-swatch--service" aria-hidden="true" />{ag.legendService}</li>
            <li><span className="legend-swatch legend-swatch--seated" aria-hidden="true" />{ag.legendServiceReal}</li>
            <li><span className="legend-swatch legend-swatch--prep" aria-hidden="true" />{ag.legendPrep}</li>
            <li><span className="legend-swatch legend-swatch--block" aria-hidden="true" />{ag.legendBlock}</li>
            <li><span className="legend-swatch legend-swatch--released" aria-hidden="true" />{ag.legendReleased}</li>
            <li><span className="legend-swatch legend-swatch--closed" aria-hidden="true" />{ag.legendClosed}</li>
            {showNow && <li><span className="legend-swatch legend-swatch--now" aria-hidden="true" />{ag.legendNow}</li>}
            {loadSlots.size > 0 && <li><span className="legend-swatch legend-swatch--load" aria-hidden="true" />{ag.legendLoad}</li>}
          </ul>
        </>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={<CalendarDays aria-hidden="true" />} title={ag.empty} />
        </div>
      ) : (
        <div className="adm-grid">
          {groups
            .filter((group) => group.reservations.length > 0)
            .map((group) => (
              <section className="card" key={group.kind} aria-labelledby={`agenda-group-${group.kind}`}>
                <header className="card__header">
                  <h2 className="card__title" id={`agenda-group-${group.kind}`}>
                    {group.kind === 'lunch' ? <Sun aria-hidden="true" className="inline-icon" /> : <Moon aria-hidden="true" className="inline-icon" />}{' '}
                    {t.shift[group.kind]}
                    {group.shift && <span className="card__subtitle num"> {group.shift.start}–{group.shift.end}</span>}
                  </h2>
                </header>
                <ul className="res-list">
                  {group.reservations.map((r) => (
                    <li className="res-item" key={r.id}>
                      <span className="res-item__time num">{formatTime(toMs(r.startAt))}</span>
                      <div className="res-item__main">
                        <span className="res-item__name">
                          <button type="button" onClick={() => actions.openReservation(r.id)}>
                            {r.customer.name}
                          </button>
                        </span>
                        <span className="res-item__meta">
                          <span>{placeLabel(data.tables, r.tableId)}</span>
                          <span>{t.common.people(r.partySize)}</span>
                          <SourceLabel source={r.source} />
                          <ReservationStatusBadge status={r.status} />
                        </span>
                      </div>
                      <div className="res-item__actions">
                        {quickAction(r)}
                        <button type="button" className="btn btn--sm" onClick={() => actions.openReservation(r.id)}>
                          {t.admin.actions.details}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          {shifts.length === 0 && <Notice tone="neutral">{ag.closed}</Notice>}
        </div>
      )}

      {blockId && <BlockDialog blockId={blockId} onClose={() => setBlockId(null)} />}
    </>
  );
}
