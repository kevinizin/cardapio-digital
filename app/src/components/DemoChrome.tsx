import { ArrowLeftRight, CloudOff, Download, LogOut, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../data/api';
import { clearBookingDraft, downloadTextFile } from '../data/browser';
import { t as ptTexts, useT } from '../i18n';
import { useSnapshot, useStore } from '../state/store';
import { ConfirmDialog } from './ConfirmDialog';
import { Notice, useToast } from './Feedback';
import { ParisClock } from './Brand';

/** Aviso discreto e permanente de demonstração, com alternância entre as interfaces. */
export function DemoRibbon({ area }: { area: 'public' | 'admin' }) {
  const store = useStore();
  const t = useT();
  if (store.kind === 'remote') return area === 'admin' ? <AdminBar /> : null;
  return (
    <div className="demo-ribbon">
      <div className="demo-ribbon__inner">
        <span className="demo-ribbon__label">
          <span className="demo-ribbon__dot" aria-hidden="true" />
          {t.demo.ribbon}
        </span>
        <span className="demo-ribbon__clock">
          <ParisClock compact />
        </span>
        <Link className="demo-ribbon__switch" to={area === 'public' ? '/admin' : '/'}>
          <ArrowLeftRight aria-hidden="true" />
          {area === 'public' ? t.demo.toAdmin : t.demo.toPublic}
        </Link>
      </div>
    </div>
  );
}

/** Barra da administração real: situação do salvamento, site do cliente e sair. */
function AdminBar() {
  const t = ptTexts;
  const { persistence } = useSnapshot();
  const sync = persistence.mode === 'remote' ? persistence.sync : 'saved';
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="demo-ribbon">
      <div className="demo-ribbon__inner">
        <span className="demo-ribbon__label" aria-live="polite">
          <span className="demo-ribbon__dot" aria-hidden="true" />
          {t.remote.sync[sync === 'offline' ? 'saving' : sync]}
        </span>
        <span className="demo-ribbon__clock">
          <ParisClock compact />
        </span>
        <Link className="demo-ribbon__switch" to="/">
          <ArrowLeftRight aria-hidden="true" />
          {t.demo.toPublic}
        </Link>
        <button
          type="button"
          className="demo-ribbon__switch"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            void api.logout().finally(() => window.location.assign('/admin'));
          }}
        >
          <LogOut aria-hidden="true" />
          {t.remote.login.logout}
        </button>
      </div>
    </div>
  );
}

/** Explica quando os dados estão apenas em memória; nunca apaga nada sozinho. */
export function PersistenceBanner() {
  const t = useT();
  const { persistence } = useSnapshot();
  const store = useStore();
  const notify = useToast();
  const [confirming, setConfirming] = useState(false);
  if (persistence.mode === 'local') return null;
  if (persistence.mode === 'remote') {
    if (persistence.sync !== 'offline') return null;
    return (
      <div className="persistence-banner">
        <Notice tone="warning" role="alert">
          <p className="cluster">
            <CloudOff aria-hidden="true" />
            {t.remote.sync.offline}
          </p>
        </Notice>
      </div>
    );
  }

  const message =
    persistence.reason === 'unavailable'
      ? t.persistence.unavailable
      : persistence.reason === 'quota'
        ? t.persistence.quota
        : t.persistence.invalid;
  const raw = store.getInvalidRaw();

  return (
    <div className="persistence-banner">
      <Notice tone="warning" role="alert">
        <p>{message}</p>
        {persistence.reason === 'invalid' && (
          <div className="cluster">
            {raw && (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => downloadTextFile('maison-elise-dados-salvos-brutos.txt', raw, 'text/plain;charset=utf-8')}
              >
                <Download aria-hidden="true" />
                {t.persistence.downloadRaw}
              </button>
            )}
            <button type="button" className="btn btn--sm btn--danger-soft" onClick={() => setConfirming(true)}>
              <RotateCcw aria-hidden="true" />
              {t.persistence.restore}
            </button>
          </div>
        )}
      </Notice>
      <ConfirmDialog
        open={confirming}
        title={t.persistence.restoreTitle}
        description={t.persistence.restoreText}
        confirmLabel={t.persistence.restore}
        tone="danger"
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          store.restoreDemo();
          clearBookingDraft();
          setConfirming(false);
          notify({ tone: 'success', title: t.persistence.restoredTitle, description: t.persistence.restoredText });
        }}
      />
    </div>
  );
}
