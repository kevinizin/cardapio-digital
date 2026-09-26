import { Check, Copy, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ReservationStatusBadge } from '../../components/Badges';
import { Notice } from '../../components/Feedback';
import { useDocumentTitle } from '../../components/PageLoading';
import { copyText, isRecentReservationCode } from '../../data/browser';
import { normalizeCode } from '../../domain/ids';
import { MINUTE_MS, parisDate, parisTime, toMs } from '../../domain/time';
import { useI18n } from '../../i18n';
import { usePublicFeatures } from '../../state/features';
import { useData, useStore } from '../../state/store';

export function ConfirmationPage() {
  const { t, f } = useI18n();
  const { formatDuration, formatLocalDateLong, formatParisOffset, formatTime } = f;
  const c = t.public.confirmation;
  const b = t.public.booking;
  const demo = useStore().kind === 'demo';
  const features = usePublicFeatures();
  useDocumentTitle(c.documentTitle);
  const { code = '' } = useParams();
  const data = useData();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const normalized = normalizeCode(code);
  const reservation = data.reservations.find((r) => r.code === normalized);

  // Detalhes só no navegador que criou a reserva; demais casos usam a consulta com e-mail.
  if (!reservation || !isRecentReservationCode(reservation.code)) {
    return (
      <section className="container pub-narrow pub-section">
        <h1>{c.restrictedTitle}</h1>
        <p className="muted">{c.restrictedText}</p>
        <div className="cluster">
          <Link to={`/consultar${normalized ? `?codigo=${encodeURIComponent(normalized)}` : ''}`} className="btn btn--primary">
            <Search aria-hidden="true" />
            {c.lookup}
          </Link>
          <Link to="/" className="btn">
            {c.home}
          </Link>
        </div>
      </section>
    );
  }

  const start = toMs(reservation.startAt);
  const isConfirmed = reservation.status === 'confirmed';

  const onCopy = async () => {
    setCopyState((await copyText(reservation.code)) ? 'copied' : 'failed');
  };

  return (
    <section className="container pub-narrow pub-section">
      <div className="confirm-card">
        {isConfirmed && (
          <span className="confirm-card__icon" aria-hidden="true">
            <Check />
          </span>
        )}
        <h1>{isConfirmed ? c.heading : t.public.lookup.resultTitle}</h1>
        {isConfirmed ? <p className="muted">{c.lead}</p> : <ReservationStatusBadge status={reservation.status} />}

        <div className="stack" style={{ justifyItems: 'center', '--stack-gap': '0.5rem' } as React.CSSProperties}>
          <p className="field__label" id="confirm-code-label">
            {c.codeLabel}
          </p>
          <div className="code-display">
            <span className="code-display__value" aria-labelledby="confirm-code-label">
              {reservation.code}
            </span>
            <button type="button" className="btn btn--sm" onClick={onCopy}>
              <Copy aria-hidden="true" />
              {c.copy}
            </button>
          </div>
          <p className="field__hint" aria-live="polite">
            {copyState === 'copied' ? c.copied : copyState === 'failed' ? t.common.copyFailed : ''}
          </p>
        </div>

        {demo ? (
          <Notice tone="neutral">{c.simulated}</Notice>
        ) : features?.email && reservation.customer.email ? (
          <Notice tone="success">{c.emailSent(reservation.customer.email)}</Notice>
        ) : (
          features && <Notice tone="neutral">{c.noEmail}</Notice>
        )}

        <dl className="summary-list">
          <div className="summary-row">
            <dt>{b.reviewDate}</dt>
            <dd>{formatLocalDateLong(parisDate(start))}</dd>
          </div>
          <div className="summary-row">
            <dt>{b.reviewTime}</dt>
            <dd>{b.reviewTimeValue(parisTime(start), formatParisOffset(start))}</dd>
          </div>
          <div className="summary-row">
            <dt>{b.reviewPeople}</dt>
            <dd>{t.common.people(reservation.partySize)}</dd>
          </div>
          <div className="summary-row">
            <dt>{b.reviewDuration}</dt>
            <dd>
              {b.reviewDurationValue(
                formatDuration(reservation.serviceMinutes),
                formatTime(start + reservation.serviceMinutes * MINUTE_MS),
              )}
            </dd>
          </div>
          <div className="summary-row">
            <dt>{b.reviewName}</dt>
            <dd>{reservation.customer.name}</dd>
          </div>
          <div className="summary-row">
            <dt>{b.reviewEmail}</dt>
            <dd>{reservation.customer.email}</dd>
          </div>
        </dl>

        <div className="cluster" style={{ justifyContent: 'center' }}>
          <Link to={`/consultar?codigo=${encodeURIComponent(reservation.code)}`} className="btn btn--primary">
            <Search aria-hidden="true" />
            {c.lookup}
          </Link>
          <Link to="/reservar" className="btn">
            {c.bookAnother}
          </Link>
          <Link to="/" className="btn btn--ghost">
            {c.home}
          </Link>
        </div>
      </div>
    </section>
  );
}
