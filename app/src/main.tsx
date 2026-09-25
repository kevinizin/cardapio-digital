import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/source-sans-3';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/remote.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { AppStore } from './data/appStore';
import { DemoStore } from './data/demoStore';
import { RemoteStore } from './data/remoteStore';
import { BrowserStorageRepository } from './data/repository';
import { t } from './i18n';

/**
 * `VITE_DATA_MODE=demo` mantém a demonstração com dados fictícios no
 * navegador; sem ela, o site usa os dados reais do servidor.
 */
const DEMO_MODE = import.meta.env.VITE_DATA_MODE === 'demo';
const root = createRoot(document.getElementById('root') as HTMLElement);

function render(store: AppStore) {
  root.render(
    <StrictMode>
      <App store={store} />
    </StrictMode>,
  );
}

async function start() {
  if (DEMO_MODE) {
    render(new DemoStore(BrowserStorageRepository.fromWindow()));
    return;
  }
  try {
    render(await RemoteStore.load('public'));
  } catch {
    root.render(
      <div className="boot-error" role="alert">
        <p>{t.remote.bootError}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          {t.remote.retry}
        </button>
      </div>,
    );
  }
}

void start();
