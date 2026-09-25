import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Feedback';
import { PageLoading } from './components/PageLoading';
import type { AppStore } from './data/appStore';
import { BookingPage } from './features/public/BookingPage';
import { ConfirmationPage } from './features/public/ConfirmationPage';
import { HomePage } from './features/public/HomePage';
import { LookupPage } from './features/public/LookupPage';
import { NotFoundPage } from './features/public/NotFoundPage';
import { PublicLayout } from './features/public/PublicLayout';
import { StoreProvider } from './state/store';

// A administração é carregada sob demanda para manter leve a página pública.
const AdminApp = lazy(() => import('./features/admin/AdminApp'));

/** Ao trocar de página: volta ao topo e leva o foco ao conteúdo principal. */
function RouteEffects() {
  const { pathname } = useLocation();
  const firstRender = useRef(true);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.getElementById('conteudo')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

export function App({ store }: { store: AppStore }) {
  return (
    <StoreProvider store={store}>
      <ToastProvider>
        <BrowserRouter>
          <RouteEffects />
          <ErrorBoundary>
            <Routes>
              <Route path="admin/*" element={<Suspense fallback={<PageLoading />}><AdminApp /></Suspense>} />
              <Route element={<PublicLayout />}>
                <Route index element={<HomePage />} />
                <Route path="reservar" element={<BookingPage />} />
                <Route path="reserva/:code" element={<ConfirmationPage />} />
                <Route path="consultar" element={<LookupPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </StoreProvider>
  );
}
