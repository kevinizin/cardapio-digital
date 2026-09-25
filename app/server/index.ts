import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './app';
import { PgStateStore } from './state';

/**
 * Servidor de produção (Railway): API + site já compilado, na mesma origem.
 * Variáveis: DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET, PORT e,
 * opcionalmente, DATABASE_SSL=true para conexões externas ao Railway.
 */
function required(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    console.error(`Configure a variável ${name}${minLength > 1 ? ` (mínimo ${minLength} caracteres)` : ''}.`);
    process.exit(1);
  }
  return value;
}

const store = new PgStateStore(required('DATABASE_URL'), { ssl: process.env.DATABASE_SSL === 'true' });
await store.migrate();

const handler = createHandler({
  store,
  adminPassword: required('ADMIN_PASSWORD', 8),
  sessionSecret: required('SESSION_SECRET', 32),
  staticDir: resolve(dirname(fileURLToPath(import.meta.url)), '../dist'),
  secureCookies: process.env.NODE_ENV === 'production',
});

const port = Number(process.env.PORT ?? 3000);
const server = createServer((req, res) => void handler(req, res));
server.listen(port, () => console.log(`Servidor ouvindo na porta ${port}`));

const shutdown = () => server.close(() => void store.close().then(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
