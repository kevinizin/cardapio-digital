import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/source-sans-3';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DemoStore } from './data/demoStore';
import { BrowserStorageRepository } from './data/repository';

const store = new DemoStore(BrowserStorageRepository.fromWindow());

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
