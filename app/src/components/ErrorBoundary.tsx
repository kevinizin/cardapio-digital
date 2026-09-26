import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useT } from '../i18n';

interface State {
  error: Error | null;
}

/** Evita tela em branco: mostra uma mensagem e permite recarregar. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro inesperado na interface', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorScreen />;
  }
}

function ErrorScreen() {
  const t = useT();
  return (
    <div className="error-screen" role="alert">
      <p className="eyebrow">{t.brand.name}</p>
      <h1>{t.errorScreen.title}</h1>
      <p className="muted">{t.errorScreen.text}</p>
      <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
        {t.errorScreen.reload}
      </button>
    </div>
  );
}
