import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n';

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
    return (
      <div className="error-screen" role="alert">
        <p className="eyebrow">{t.brand.name}</p>
        <h1>Algo não saiu como esperado</h1>
        <p className="muted">
          A página encontrou um erro inesperado. Os dados salvos neste navegador não foram apagados. Recarregue para
          tentar novamente.
        </p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Recarregar página
        </button>
      </div>
    );
  }
}
