import { Download, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { RESERVATION_STATUS_ICONS, ReservationStatusBadge, SourceLabel } from '../../components/Badges';
import { DateField } from '../../components/DateField';
import { EmptyState, useToast } from '../../components/Feedback';
import { useDocumentTitle } from '../../components/PageLoading';
import { downloadTextFile } from '../../data/browser';
import { CSV_BOM, toCsv } from '../../domain/csv';
import { addDays, addMonths, parisDate, parisMonth, parisTime, toMs } from '../../domain/time';
import { RESERVATION_SOURCES, RESERVATION_STATUSES, type Reservation, type ReservationSource, type ReservationStatus } from '../../domain/types';
import { formatDateTime, formatLocalDate, formatLocalDateCompact, formatTime, t } from '../../i18n';
import { useData, useNow } from '../../state/store';
import { useAdminActions } from './AdminActions';
import { PageHead } from './AdminLayout';
import { placeLabel } from './adminFormat';

const rp = t.admin.reservations;
const PAGE_SIZE = 25;

type Period = keyof typeof rp.periods;
const PERIODS = Object.keys(rp.periods) as Period[];
const PERIOD_FROM_QUERY: Record<string, Period> = { passadas: 'past', futuras: 'upcoming', hoje: 'today' };

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.]/g, '');

export function ReservationsPage() {
  useDocumentTitle(rp.documentTitle);
  const data = useData();
  const now = useNow(30_000);
  const actions = useAdminActions();
  const notify = useToast();
  const [params] = useSearchParams();

  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>(() => PERIOD_FROM_QUERY[params.get('periodo') ?? ''] ?? 'next7');
  const [statuses, setStatuses] = useState<Set<ReservationStatus>>(() => {
    const fromQuery = params.get('status');
    return new Set(fromQuery && RESERVATION_STATUSES.includes(fromQuery as ReservationStatus) ? [fromQuery as ReservationStatus] : []);
  });
  const [source, setSource] = useState<ReservationSource | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const today = parisDate(now);

  const filtered = useMemo(() => {
    const month = parisMonth(now);
    const search = normalize(query);
    const inPeriod = (r: Reservation) => {
      const start = toMs(r.startAt);
      const date = parisDate(start);
      switch (period) {
        case 'today':
          return date === today;
        case 'next7':
          return date >= today && date <= addDays(today, 6);
        case 'thisMonth':
          return parisMonth(start) === month;
        case 'lastMonth':
          return parisMonth(start) === addMonths(month, -1);
        case 'upcoming':
          return start >= now;
        case 'past':
          return start < now;
        case 'custom':
          return (!from || date >= from) && (!to || date <= to);
        default:
          return true;
      }
    };
    const list = data.reservations.filter(
      (r) =>
        inPeriod(r) &&
        (statuses.size === 0 || statuses.has(r.status)) &&
        (source === 'all' || r.source === source) &&
        (!search ||
          normalize(r.customer.name).includes(search) ||
          normalize(r.code).includes(search) ||
          normalize(r.customer.email).includes(search)),
    );
    const descending = period === 'past' || period === 'lastMonth';
    return list.sort((a, b) => (descending ? toMs(b.startAt) - toMs(a.startAt) : toMs(a.startAt) - toMs(b.startAt)));
  }, [data, now, today, query, period, statuses, source, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetPage = () => setPage(1);
  const toggleStatus = (status: ReservationStatus) => {
    setStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
    resetPage();
  };

  const exportCsv = () => {
    const rows = filtered.map((r) => {
      const start = toMs(r.startAt);
      const table = data.tables.find((tb) => tb.id === r.tableId);
      return [
        r.code,
        formatLocalDate(parisDate(start)),
        parisTime(start),
        table?.shared ? '' : r.tableId,
        table ? t.area[table.area] : '',
        r.partySize,
        t.reservationStatus[r.status],
        t.source[r.source],
        r.customer.name,
        r.customer.email,
        r.customer.phone,
        r.customer.notes,
        r.serviceMinutes,
        r.prepMinutes,
        formatDateTime(toMs(r.createdAt)),
        r.seatedAt ? formatDateTime(toMs(r.seatedAt)) : '',
        r.completedAt ? formatDateTime(toMs(r.completedAt)) : '',
        r.cancelledAt ? formatDateTime(toMs(r.cancelledAt)) : '',
        r.cancelReason ?? '',
      ];
    });
    downloadTextFile(rp.csvFile(today), CSV_BOM + toCsv([rp.csvHeaders, ...rows]), 'text/csv;charset=utf-8');
    notify({ tone: 'success', title: rp.csvDone(rows.length) });
  };

  const clearFilters = () => {
    setQuery('');
    setPeriod('all');
    setStatuses(new Set());
    setSource('all');
    setFrom('');
    setTo('');
    resetPage();
  };

  return (
    <>
      <PageHead
        title={rp.title}
        description={rp.subtitle}
        actions={
          <>
            <button type="button" className="btn" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download aria-hidden="true" />
              {rp.exportCsv}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => actions.createReservation()}>
              <Plus aria-hidden="true" />
              {t.admin.actions.newReservation}
            </button>
          </>
        }
      />

      <div className="adm-toolbar" role="search">
        <div className="field" style={{ flex: '1 1 16rem' }}>
          <label className="field__label" htmlFor="res-search">
            {rp.search}
          </label>
          <input
            id="res-search"
            className="input"
            type="search"
            placeholder={rp.searchPlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              resetPage();
            }}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="res-period">
            {rp.period}
          </label>
          <select
            id="res-period"
            className="select"
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value as Period);
              resetPage();
            }}
          >
            {PERIODS.map((key) => (
              <option key={key} value={key}>
                {rp.periods[key]}
              </option>
            ))}
          </select>
        </div>
        {period === 'custom' && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="res-from">
                {rp.from}
              </label>
              <DateField id="res-from" value={from} onChange={(value) => { setFrom(value); resetPage(); }} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="res-to">
                {rp.to}
              </label>
              <DateField id="res-to" value={to} onChange={(value) => { setTo(value); resetPage(); }} />
            </div>
          </>
        )}
        <div className="field">
          <label className="field__label" htmlFor="res-source">
            {rp.source}
          </label>
          <select
            id="res-source"
            className="select"
            value={source}
            onChange={(event) => {
              setSource(event.target.value as ReservationSource | 'all');
              resetPage();
            }}
          >
            <option value="all">{rp.allSources}</option>
            {RESERVATION_SOURCES.map((item) => (
              <option key={item} value={item}>
                {t.source[item]}
              </option>
            ))}
          </select>
        </div>
        <div className="adm-toolbar__group" role="group" aria-labelledby="res-status-label" style={{ flexBasis: '100%' }}>
          <span className="adm-toolbar__label" id="res-status-label">
            {rp.status}
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
            <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
              {rp.clear}
            </button>
          </div>
        </div>
      </div>

      <section className="card" aria-labelledby="res-results">
        <header className="card__header">
          <h2 id="res-results" className="card__title" aria-live="polite">
            {rp.results(filtered.length)}
          </h2>
        </header>
        {filtered.length === 0 ? (
          <EmptyState icon={<Search aria-hidden="true" />} title={rp.empty}>
            <button type="button" className="btn btn--sm" onClick={clearFilters}>
              {rp.clear}
            </button>
          </EmptyState>
        ) : (
          <>
            <ul className="res-list">
              {visible.map((r) => {
                const start = toMs(r.startAt);
                return (
                  <li className="res-item" key={r.id}>
                    <span className="res-item__time num">
                      {formatTime(start)}
                      <span className="field__hint" style={{ display: 'block', fontWeight: 600 }}>
                        {formatLocalDateCompact(parisDate(start))}
                      </span>
                    </span>
                    <div className="res-item__main">
                      <span className="res-item__name">
                        <button type="button" onClick={() => actions.openReservation(r.id)}>
                          {r.customer.name}
                        </button>
                      </span>
                      <span className="res-item__meta">
                        <span className="num">{r.code}</span>
                        <span>{placeLabel(data.tables, r.tableId)}</span>
                        <span>{t.common.people(r.partySize)}</span>
                        <SourceLabel source={r.source} />
                      </span>
                    </div>
                    <div className="res-item__actions">
                      <ReservationStatusBadge status={r.status} />
                      <button type="button" className="btn btn--sm" onClick={() => actions.openReservation(r.id)}>
                        {t.admin.actions.details}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {totalPages > 1 && (
              <nav className="pagination" aria-label={rp.page(currentPage, totalPages)}>
                <button type="button" className="btn btn--sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>
                  {rp.prev}
                </button>
                <span>{rp.page(currentPage, totalPages)}</span>
                <button type="button" className="btn btn--sm" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages}>
                  {rp.next}
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </>
  );
}
