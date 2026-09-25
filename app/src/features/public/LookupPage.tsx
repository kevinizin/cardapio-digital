import { CircleX, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ReservationStatusBadge } from '../../components/Badges';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Notice, useToast } from '../../components/Feedback';
import { describedBy, Field } from '../../components/Field';
import { useDocumentTitle } from '../../components/PageLoading';
import type { DomainError } from '../../domain/errors';
import { customerCancelState } from '../../domain/lifecycle';
import { MINUTE_MS, parisDate, parisTime, toMs } from '../../domain/time';
import { useI18n } from '../../i18n';
import { useData, useNow, useStore } from '../../state/store';

export function LookupPage() {
  const { t, f, errorMessage } = useI18n();
  const { formatDateTime, formatDuration, formatLocalDate, formatLocalDateLong, formatParisOffset, formatTime } = f;
  const l = t.public.lookup;
  const b = t.public.booking;
  useDocumentTitle(l.documentTitle);
  const [params] = useSearchParams();
  const data = useData();
  const store = useStore();
  const demo = store.kind === 'demo';
  const cancelledText = demo ? `${l.cancelledText} ${l.cancelledDemo}` : l.cancelledText;
  const now = useNow(30_000);
  const notify = useToast();
  const [code, setCode] = useState(() => params.get('codigo') ?? '');
  const [email, setEmail] = useState('');
  const [foundId, setFoundId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelErrors, setCancelErrors] = useState<DomainError[]>([]);
  const [justCancelled, setJustCancelled] = useState(false);
  const [searching, setSearching] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  /** Código e e-mail da consulta que encontrou a reserva (exigidos para cancelar). */
  const [credentials, setCredentials] = useState<{ code: string; email: string } | null>(null);

  const reservation = foundId ? data.reservations.find((r) => r.id === foundId) : undefined;

  const onSubmit = () => {
    setJustCancelled(false);
    if (!code.trim() || !email.trim()) {
      setFoundId(null);
      setMessage(l.required);
      return;
    }
    if (searching) return;
    setSearching(true);
    const sent = { code, email };
    void store.lookup(sent.code, sent.email).then((result) => {
      setSearching(false);
      if (!result.ok) {
        setFoundId(null);
        setMessage(errorMessage(result.errors[0]));
        return;
      }
      const match = result.value.reservation;
      // Mensagem genérica: não revela se o código existe.
      setFoundId(match?.id ?? null);
      setCredentials(match ? sent : null);
      setMessage(match ? null : l.notFound);
    });
  };

  const onCancel = async () => {
    if (!reservation || !credentials || cancelling) return;
    setCancelling(true);
    const result = await store.cancelOnline(credentials.code, credentials.email);
    setCancelling(false);
    if (result.ok) {
      setConfirming(false);
      setCancelErrors([]);
      setJustCancelled(true);
      notify({ tone: 'success', title: l.cancelledTitle, description: cancelledText });
    } else {
      setCancelErrors(result.errors);
    }
  };

  const start = reservation ? toMs(reservation.startAt) : 0;
  const cancelState = reservation ? customerCancelState(data, reservation, now) : null;

  return (
    <div className="container">
      <header className="pub-page-head">
        <p className="eyebrow">{t.brand.name}</p>
        <h1>{l.heading}</h1>
        <p>{l.lead}</p>
      </header>

      <div className="lookup-grid">
        <form
          noValidate
          className="booking-panel"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <Field id="lookup-code" label={l.code} hint={l.codeHint}>
            <input
              id="lookup-code"
              className="input num"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-describedby={describedBy('lookup-code', l.codeHint)}
            />
          </Field>
          <Field id="lookup-email" label={l.email}>
            <input
              id="lookup-email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={120}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <button type="submit" className="btn btn--primary btn--lg" disabled={searching} aria-busy={searching}>
            <Search aria-hidden="true" />
            {l.submit}
          </button>
          <div aria-live="polite">{message && <Notice tone={message === l.required ? 'warning' : 'info'}>{message}</Notice>}</div>
        </form>

        {reservation && (
          <section className="booking-panel" aria-labelledby="lookup-result-title">
            <div className="cluster" style={{ justifyContent: 'space-between' }}>
              <h2 id="lookup-result-title" className="booking-panel__title">
                {l.resultTitle}
              </h2>
              <ReservationStatusBadge status={reservation.status} />
            </div>

            <dl className="summary-list">
              <div className="summary-row">
                <dt>{l.code_}</dt>
                <dd className="num">{reservation.code}</dd>
              </div>
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
            </dl>

            {reservation.status === 'cancelled' && reservation.cancelledAt && (
              <Notice tone={justCancelled ? 'success' : 'neutral'} title={justCancelled ? l.cancelledTitle : undefined}>
                <p>{justCancelled ? cancelledText : l.alreadyCancelled(formatDateTime(toMs(reservation.cancelledAt)))}</p>
              </Notice>
            )}
            {reservation.status === 'seated' && <Notice tone="neutral">{l.seated}</Notice>}
            {reservation.status === 'completed' && <Notice tone="neutral">{l.completed}</Notice>}
            {reservation.status === 'no_show' && <Notice tone="neutral">{l.noShow}</Notice>}
            {cancelState === 'deadline_passed' && (
              <Notice tone="warning">{l.deadlinePassed(data.settings.rules.customerCancelMinutes)}</Notice>
            )}
            {reservation.status === 'confirmed' && <p className="muted">{demo ? `${l.changeNote} ${l.changeNoteDemo}` : l.changeNote}</p>}

            <div className="booking-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setFoundId(null);
                  setCode('');
                  setEmail('');
                  setJustCancelled(false);
                  document.getElementById('lookup-code')?.focus();
                }}
              >
                {l.newLookup}
              </button>
              {cancelState === 'allowed' && (
                <button type="button" className="btn btn--danger-soft" onClick={() => setConfirming(true)}>
                  <CircleX aria-hidden="true" />
                  {l.cancel}
                </button>
              )}
            </div>

            <ConfirmDialog
              open={confirming}
              title={l.cancelTitle}
              description={l.cancelText(formatLocalDate(parisDate(start)), parisTime(start))}
              confirmLabel={l.cancelConfirm}
              tone="danger"
              errors={cancelErrors}
              onClose={() => {
                setConfirming(false);
                setCancelErrors([]);
              }}
              onConfirm={onCancel}
            />
          </section>
        )}
      </div>
    </div>
  );
}
