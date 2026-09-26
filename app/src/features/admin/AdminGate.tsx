import { LogIn } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../components/Brand';
import { Notice, useToast } from '../../components/Feedback';
import { Field } from '../../components/Field';
import { PageLoading, useDocumentTitle } from '../../components/PageLoading';
import { api, ApiFailure } from '../../data/api';
import { RemoteStore } from '../../data/remoteStore';
import { errorMessage, t } from '../../i18n';
import { StoreProvider, useStore } from '../../state/store';

const l = t.remote.login;

type GateState =
  | { kind: 'checking' }
  | { kind: 'login'; message: string | null }
  | { kind: 'ready'; store: RemoteStore };

/**
 * Na versão real, a administração só recebe os dados completos (nomes e
 * contatos) depois do login; na demonstração, usa a mesma fonte do site.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const publicStore = useStore();
  if (publicStore.kind === 'demo') return <>{children}</>;
  return <RemoteAdminGate>{children}</RemoteAdminGate>;
}

function RemoteAdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: 'checking' });
  const storeRef = useRef<RemoteStore | null>(null);

  const open = async (message: string | null = null) => {
    try {
      const existing = storeRef.current;
      if (existing) {
        // Sessão renovada: reaproveita a mesma fonte e reenvia o que ficou pendente.
        existing.refresh();
        setState({ kind: 'ready', store: existing });
        return;
      }
      const store = await RemoteStore.load('admin');
      storeRef.current = store;
      setState({ kind: 'ready', store });
    } catch (error) {
      setState({ kind: 'login', message: error instanceof ApiFailure && error.unauthorized ? message : l.network });
    }
  };

  useEffect(() => {
    void api
      .session()
      .then(({ authenticated }) => (authenticated ? open() : setState({ kind: 'login', message: null })))
      .catch(() => setState({ kind: 'login', message: l.network }));
    return () => storeRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (state.kind !== 'ready') return undefined;
    return state.store.onAuthLost(() => setState({ kind: 'login', message: l.expired }));
  }, [state]);

  if (state.kind === 'checking') return <PageLoading />;
  if (state.kind === 'login') return <LoginForm message={state.message} onSuccess={() => open()} />;
  return (
    <StoreProvider store={state.store}>
      <SyncNotices store={state.store} />
      {children}
    </StoreProvider>
  );
}

/** Mostra quando uma alteração não pôde ser salva por conflito com outra pessoa. */
function SyncNotices({ store }: { store: RemoteStore }) {
  const notify = useToast();
  useEffect(
    () =>
      store.onRejected((errors) => {
        const [first, ...rest] = errors;
        notify({
          tone: 'error',
          title: t.remote.sync.rejectedTitle,
          description: [errorMessage(first), ...rest.map(errorMessage)].join(' '),
        });
      }),
    [store, notify],
  );
  return null;
}

function LoginForm({ message, onSuccess }: { message: string | null; onSuccess: () => void }) {
  useDocumentTitle(l.documentTitle);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.login(password);
      setPassword('');
      onSuccess();
    } catch (failure) {
      const status = failure instanceof ApiFailure ? failure.status : 0;
      setError(status === 401 ? l.wrong : status === 429 ? l.rateLimited : l.network);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page" id="conteudo" tabIndex={-1}>
      <form
        className="login-card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Logo variant="sidebar" eager />
        <h1>{l.heading}</h1>
        <p className="muted">{l.lead}</p>
        {message && <Notice tone="warning">{message}</Notice>}
        <Field id="admin-password" label={l.password} error={error ?? undefined}>
          <input
            id="admin-password"
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'admin-password-error' : undefined}
          />
        </Field>
        <button type="submit" className="btn btn--primary btn--lg" disabled={submitting || !password} aria-busy={submitting}>
          <LogIn aria-hidden="true" />
          {submitting ? l.submitting : l.submit}
        </button>
        <Link to="/" className="btn btn--ghost">
          {l.backToSite}
        </Link>
      </form>
    </main>
  );
}
