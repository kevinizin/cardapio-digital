import { ArrowLeftRight, Download, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { clearBookingDraft, downloadTextFile } from '../data/browser';
import { t } from '../i18n';
import { useSnapshot, useStore } from '../state/store';
import { ConfirmDialog } from './ConfirmDialog';
import { Notice, useToast } from './Feedback';
import { ParisClock } from './Brand';

/** Aviso discreto e permanente de demonstração, com alternância entre as interfaces. */
export function DemoRibbon({ area }: { area: 'public' | 'admin' }) {
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

/** Explica quando os dados estão apenas em memória; nunca apaga nada sozinho. */
export function PersistenceBanner() {
  const { persistence } = useSnapshot();
  const store = useStore();
  const notify = useToast();
  const [confirming, setConfirming] = useState(false);
  if (persistence.mode === 'local') return null;

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
        title="Restaurar a demonstração?"
        description="Os dados salvos ilegíveis desta aplicação serão substituídos por novos dados fictícios. Outras informações do navegador não são afetadas."
        confirmLabel={t.persistence.restore}
        tone="danger"
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          store.restoreDemo();
          clearBookingDraft();
          setConfirming(false);
          notify({ tone: 'success', title: 'Demonstração restaurada', description: 'Novos dados fictícios foram gerados.' });
        }}
      />
    </div>
  );
}
