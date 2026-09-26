import { useEffect, useState } from 'react';
import { api, type EmailHistoryEntry } from '../../data/api';
import { formatDateTime, t } from '../../i18n';
import { useStore } from '../../state/store';

const e = t.admin.emails;

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; enabled: boolean; emails: EmailHistoryEntry[] };

/** E-mails enviados ao cliente desta reserva (só na versão real, com servidor). */
export function EmailHistory({ reservationId, updatedAt }: { reservationId: string; updatedAt: string }) {
  const remote = useStore().kind === 'remote';
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!remote) return;
    let active = true;
    const load = () =>
      api
        .adminEmails(reservationId)
        .then((result) => active && setState({ status: 'ready', ...result }))
        .catch(() => active && setState({ status: 'error' }));
    void load();
    // A fila envia em segundo plano: confere de novo logo depois de uma mudança.
    const retry = window.setTimeout(load, 5_000);
    return () => {
      active = false;
      window.clearTimeout(retry);
    };
  }, [remote, reservationId, updatedAt]);

  if (!remote) return null;

  return (
    <section className="drawer-section">
      <h3 className="drawer-section__title">{e.title}</h3>
      {state.status === 'loading' ? (
        <p className="subtle">…</p>
      ) : state.status === 'error' ? (
        <p className="subtle">{e.loadError}</p>
      ) : state.emails.length === 0 ? (
        <p className="subtle">{state.enabled ? e.empty : e.disabled}</p>
      ) : (
        <ol className="history">
          {state.emails.map((entry) => (
            <li className="history__item" key={`${entry.kind}-${entry.createdAt}`}>
              <span className="history__when num">
                {formatDateTime(Date.parse(entry.sentAt ?? entry.createdAt))} · {e.status[entry.status]}
              </span>
              <span>{e.kind[entry.kind]}</span>
              {entry.status === 'failed' && (
                <span className="history__detail">
                  {e.attempts(entry.attempts)}
                  {entry.lastError ? ` · ${entry.lastError}` : ''}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
