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
import { getBundle, HTML_LANG, initialLocale, isAdminPath, t } from './i18n';

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
    // Fora do roteador: o idioma segue a escolha do visitante (a administração, português).
    const locale = isAdminPath(window.location.pathname) ? 'pt' : initialLocale();
    const texts = locale === 'pt' ? t : getBundle(locale).t;
    document.documentElement.lang = HTML_LANG[locale];
    root.render(
      <div className="boot-error" role="alert">
        <p>{texts.remote.bootError}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          {texts.remote.retry}
        </button>
      </div>,
    );
  }
}

void start();
