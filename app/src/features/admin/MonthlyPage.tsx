import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { RESERVATION_STATUS_ICONS } from '../../components/Badges';
import { BarChart } from '../../components/BarChart';
import { InfoTip } from '../../components/Field';
import { useDocumentTitle } from '../../components/PageLoading';
import { computeMonthlyMetrics, type OccupancyRatio } from '../../domain/metrics';
import { isSharedTable } from '../../domain/occupancy';
import { addMonths, MINUTE_MS, parisMonth, toMs } from '../../domain/time';
import type { MonthKey } from '../../domain/types';
import { formatDayNumber, formatHours, formatLocalDate, formatMonth, formatNumber, formatPercent, t } from '../../i18n';
import { useData, useNow } from '../../state/store';
import { PageHead } from './AdminLayout';
import './monthly.css';

const m = t.admin.monthly;

function Kpi({ label, hint, value, meta, children, muted = false }: { label: string; hint: string; value: string; meta?: ReactNode; children?: ReactNode; muted?: boolean }) {
  return (
    <div className="kpi">
      <p className="kpi__label">
        {label}
        <InfoTip label={m.infoLabel(label)} align="end">
          {hint}
        </InfoTip>
      </p>
      <p className={`kpi__value${muted ? ' kpi__value--muted' : ''}`}>{value}</p>
      {meta && <p className="kpi__meta">{meta}</p>}
      {children}
    </div>
  );
}

const percentOrUnavailable = (ratio: OccupancyRatio) => formatPercent(ratio.ratio) ?? m.unavailable;

export function MonthlyPage() {
  useDocumentTitle(m.documentTitle);
  const data = useData();
  const now = useNow(60_000);
  const nowMinute = Math.floor(now / MINUTE_MS);
  const currentMonth = parisMonth(now);
  const [month, setMonth] = useState<MonthKey>(currentMonth);

  const months = useMemo(() => {
    let min = currentMonth;
    let max = currentMonth;
    for (const r of data.reservations) {
      const service = parisMonth(toMs(r.startAt));
      const created = parisMonth(toMs(r.createdAt));
      if (service < min) min = service;
      if (created < min) min = created;
      if (service > max) max = service;
    }
    const list: MonthKey[] = [];
    for (let key = min; key <= max; key = addMonths(key, 1)) list.push(key);
    return list;
  }, [data, currentMonth]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const metrics = useMemo(() => computeMonthlyMetrics(data, month, now), [data, month, nowMinute]);
  const { occupancy } = metrics;
  // Com áreas por lugares, as horas são "lugares·hora"; o segundo turno só aparece se existir.
  const bySeats = data.tables.length > 0 && data.tables.every(isSharedTable);
  const seatHours = (minutes: number) => formatNumber(Math.round(minutes / 60));
  const hasDinner = occupancy.dinner.ratio !== null && occupancy.dinner.denominatorMinutes > 0;

  const daily = metrics.daily.map((d) => ({ key: d.date, label: formatLocalDate(d.date), shortLabel: formatDayNumber(d.date), value: d.reservations }));
  const weekdays = metrics.weekdays.map((w) => ({ key: String(w.weekday), label: t.weekdays[w.weekday], shortLabel: t.weekdaysShort[w.weekday], value: w.reservations }));
  const times = metrics.startTimes.map((s) => ({ key: s.time, label: s.time, value: s.reservations }));
  const valueText = (datum: { label: string; value: number }) => m.chartValue(datum.label, datum.value);
  const index = months.indexOf(month);

  return (
    <>
      <PageHead
        title={m.title}
        description={m.subtitle}
        actions={
          <div className="month-nav">
            <button type="button" className="btn btn--icon" onClick={() => setMonth(addMonths(month, -1))} disabled={index <= 0} aria-label={m.prevMonth}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <label className="visually-hidden" htmlFor="monthly-month">
              {m.month}
            </label>
            <select id="monthly-month" className="select" value={month} onChange={(event) => setMonth(event.target.value)}>
              {months.map((key) => (
                <option key={key} value={key}>
                  {formatMonth(key)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--icon"
              onClick={() => setMonth(addMonths(month, 1))}
              disabled={index === -1 || index >= months.length - 1}
              aria-label={m.nextMonth}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        }
      />

      <h2 className="monthly-heading">{formatMonth(month)}</h2>

      <div className="kpi-grid">
        <Kpi label={m.received} hint={m.receivedHint} value={formatNumber(metrics.received.total)} meta={m.receivedMeta(metrics.received.laterCancelled)} />
        <Kpi label={m.expected} hint={m.expectedHint} value={formatNumber(metrics.expected.total)} meta={m.expectedMeta}>
          <div className="kpi__breakdown">
            {(['confirmed', 'seated', 'completed', 'no_show'] as const).map((status) => {
              const Icon = RESERVATION_STATUS_ICONS[status];
              const count = status === 'no_show' ? metrics.expected.noShow : metrics.expected[status];
              return (
                <span key={status} className={`badge badge--${status}`}>
                  <Icon aria-hidden="true" />
                  {t.reservationStatus[status]}: {count}
                </span>
              );
            })}
          </div>
        </Kpi>
        <Kpi label={m.peopleExpected} hint={m.peopleExpectedHint} value={formatNumber(metrics.peopleExpected)} meta={m.peopleExpectedMeta} />
        <Kpi label={m.peopleServed} hint={m.peopleServedHint} value={formatNumber(metrics.peopleServed)} meta={m.peopleServedMeta} />
        <Kpi
          label={m.cancellations}
          hint={m.cancellationsHint}
          value={formatNumber(metrics.cancellations.reservations)}
          meta={m.peopleMeta(metrics.cancellations.people)}
        />
        <Kpi label={m.noShows} hint={m.noShowsHint} value={formatNumber(metrics.noShows.reservations)} meta={m.peopleMeta(metrics.noShows.people)} />
        <Kpi
          label={m.occupancy}
          hint={bySeats ? m.occupancyHintSeats : m.occupancyHint}
          value={percentOrUnavailable(occupancy.planned)}
          muted={occupancy.planned.ratio === null}
          meta={
            occupancy.planned.ratio === null
              ? m.unavailableMeta
              : bySeats
                ? m.occupancyMetaSeats(seatHours(occupancy.planned.numeratorMinutes), seatHours(occupancy.planned.denominatorMinutes))
                : m.occupancyMeta(formatHours(occupancy.planned.numeratorMinutes), formatHours(occupancy.planned.denominatorMinutes))
          }
        >
          {occupancy.planned.ratio !== null && hasDinner && (
            <p className="kpi__meta">{m.occupancyShifts(percentOrUnavailable(occupancy.lunch), percentOrUnavailable(occupancy.dinner))}</p>
          )}
        </Kpi>
        <Kpi
          label={m.realized}
          hint={bySeats ? m.realizedHintSeats : m.realizedHint}
          value={percentOrUnavailable(occupancy.realized)}
          muted={occupancy.realized.ratio === null}
          meta={
            occupancy.realized.ratio === null
              ? m.unavailableMeta
              : bySeats
                ? m.realizedMetaSeats(seatHours(occupancy.realized.numeratorMinutes), seatHours(occupancy.realized.denominatorMinutes))
                : m.realizedMeta(formatHours(occupancy.realized.numeratorMinutes), formatHours(occupancy.realized.denominatorMinutes))
          }
        />
      </div>

      <p className="monthly-criterion">{m.criterion}</p>
      <div className="monthly-charts">
        <BarChart
          wide
          title={m.dailyTitle}
          data={daily}
          tableHeaders={[m.colDay, m.colReservations]}
          valueText={valueText}
          emptyText={m.emptyMonth}
        />
        <BarChart title={m.weekdayTitle} data={weekdays} tableHeaders={[m.colWeekday, m.colReservations]} valueText={valueText} emptyText={m.emptyMonth} />
        <BarChart title={m.timesTitle} data={times} tableHeaders={[m.colTime, m.colReservations]} valueText={valueText} emptyText={m.emptyMonth} />
      </div>
    </>
  );
}
