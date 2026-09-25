import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './app';
import { createEmailDomainCheck, loadDisposableDomains } from './email/domainCheck';
import { PgEmailLog } from './email/log';
import { BrevoMailer, emailSetupFromEnv } from './email/mailer';
import { disabledNotifier, EmailService } from './email/service';
import { PgStateStore } from './state';

/**
 * Servidor de produção (Railway): API + site já compilado, na mesma origem.
 * Variáveis: DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET, PORT e,
 * opcionalmente, DATABASE_SSL=true para conexões externas ao Railway.
 * E-mails (opcionais): BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME,
 * EMAIL_REPLY_TO e PUBLIC_URL. Sem BREVO_API_KEY tudo funciona, sem e-mails.
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
const emailLog = new PgEmailLog(store.pool);
await emailLog.migrate();

const emailSetup = emailSetupFromEnv(process.env);
const emailService = emailSetup.enabled
  ? new EmailService({ mailer: new BrevoMailer(emailSetup.config), log: emailLog, store, publicUrl: emailSetup.config.publicUrl })
  : null;
if (emailSetup.enabled) console.log(`E-mails ativos (Brevo), remetente ${emailSetup.config.from}.`);
else console.log(`E-mails desativados: ${emailSetup.reason}. O restante do sistema funciona normalmente.`);

// Carrega a lista de domínios temporários já na inicialização (e não na primeira reserva).
loadDisposableDomains();

const handler = createHandler({
  store,
  email: emailService ?? disabledNotifier,
  emailDomainCheck: createEmailDomainCheck(),
  adminPassword: required('ADMIN_PASSWORD', 8),
  sessionSecret: required('SESSION_SECRET', 32),
  staticDir: resolve(dirname(fileURLToPath(import.meta.url)), '../dist'),
  secureCookies: process.env.NODE_ENV === 'production',
});

const port = Number(process.env.PORT ?? 3000);
const server = createServer((req, res) => void handler(req, res));
server.listen(port, () => console.log(`Servidor ouvindo na porta ${port}`));

// Trabalho periódico dos e-mails: lembretes do dia seguinte e novas tentativas.
const emailTimer = emailService ? setInterval(() => void emailService.tick(), 60_000) : null;
emailTimer?.unref();
if (emailService) void emailService.tick();

const shutdown = () => {
  if (emailTimer) clearInterval(emailTimer);
  server.close(() => void store.close().then(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
