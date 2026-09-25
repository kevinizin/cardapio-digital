import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { z } from 'zod';
import { findByCodeAndEmail, toPublicData } from '../src/data/publicView';
import { validateDemoData } from '../src/data/schema';
import { isValidEmail } from '../src/domain/customer';
import { err, type DomainError, type Result } from '../src/domain/errors';
import { cancelByCustomer } from '../src/domain/lifecycle';
import { buildOnlineDraft, createReservation } from '../src/domain/reservations';
import { CUSTOMER_LOCALES, type DemoData, type Reservation } from '../src/domain/types';
import type { EmailDomainCheck } from './email/domainCheck';
import { disabledNotifier, type EmailNotifier } from './email/service';
import { cancellationJobs, confirmationJobs, diffEmailJobs, type EmailJob } from './email/triggers';
import { createSessionToken, isValidSession, parseCookies, passwordMatches, RateLimiter, SESSION_COOKIE, SESSION_HOURS } from './auth';
import type { StateStore } from './state';

export interface AppConfig {
  store: StateStore;
  adminPassword: string;
  sessionSecret: string;
  /** Pasta do build do site (dist). Sem ela, só a API responde. */
  staticDir?: string;
  clock?: () => number;
  /** Cookie só por HTTPS (produção). */
  secureCookies?: boolean;
  /** E-mails aos clientes (fila em segundo plano). Ausente = sem e-mails. */
  email?: EmailNotifier;
  /** Recusa e-mails temporários ou de domínios inexistentes nas reservas online. */
  emailDomainCheck?: EmailDomainCheck;
}

const MINUTE = 60_000;
const PUBLIC_BODY_LIMIT = 16 * 1024;
const ADMIN_BODY_LIMIT = 20 * 1024 * 1024;

const customerSchema = z.object({
  name: z.string().max(200),
  email: z.string().max(200),
  phone: z.string().max(60),
  notes: z.string().max(600),
  // Aceite de novidades: o instante é sempre definido pelo servidor.
  marketingOptIn: z.boolean().optional(),
});
const bookingSchema = z.object({
  date: z.string().max(10),
  time: z.string().max(5),
  partySize: z.number().int().min(0).max(100),
  customer: customerSchema,
  locale: z.enum(CUSTOMER_LOCALES as ['fr', 'pt', 'en']).optional(),
});
const lookupSchema = z.object({ code: z.string().max(40), email: z.string().max(200) });
const loginSchema = z.object({ password: z.string().max(500) });
const saveSchema = z.object({ baseRevision: z.number().int(), data: z.unknown() });

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(json);
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'JSON esperado');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'conteúdo grande demais');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'dados inválidos');
  return parsed.data;
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'desconhecido';
}

/** Recusa escrita vinda de outro site (além do cookie SameSite=Strict). */
function assertSameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  try {
    if (new URL(origin).host === host) return;
  } catch {
    // Origem malformada: recusada abaixo.
  }
  throw new HttpError(403, 'origem não permitida');
}

function securityHeaders(res: ServerResponse, path: string) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (path.startsWith('/admin') || path.startsWith('/api/')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

export function createHandler(config: AppConfig) {
  const clock = config.clock ?? Date.now;
  const loginLimiter = new RateLimiter(10, 15 * MINUTE);
  const bookingLimiter = new RateLimiter(20, 60 * MINUTE);
  const lookupLimiter = new RateLimiter(30, 15 * MINUTE);
  const { store } = config;
  const email = config.email ?? disabledNotifier;
  const staticRoot = config.staticDir ? resolve(config.staticDir) : null;

  const isAdmin = (req: IncomingMessage) =>
    isValidSession(parseCookies(req.headers.cookie)[SESSION_COOKIE], clock(), config.sessionSecret);

  const sessionCookie = (value: string, maxAgeSeconds: number) =>
    [
      `${SESSION_COOKIE}=${value}`,
      'Path=/api/admin',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAgeSeconds}`,
      config.secureCookies ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ');

  const limit = (limiter: RateLimiter, req: IncomingMessage) => {
    if (!limiter.take(clientIp(req), clock())) throw new HttpError(429, 'muitas tentativas');
  };

  /** Comando público sobre o documento travado: grava só se as regras aprovarem. */
  async function publicCommand(
    res: ServerResponse,
    command: (data: DemoData, nowMs: number) => Result<{ data: DemoData; reservation: Reservation }>,
    emails: (reservation: Reservation, nowMs: number) => EmailJob[],
  ) {
    type Outcome =
      | { ok: false; errors: DomainError[]; data: DemoData }
      | { ok: true; reservation: Reservation; data: DemoData };
    const outcome = await store.update<Outcome>((data) => {
      const nowMs = clock();
      const result = command(data, nowMs);
      if (!result.ok) return { data: null, result: { ok: false as const, errors: result.errors, data } };
      const next: DemoData = { ...result.value.data, revision: data.revision + 1 };
      return { data: next, result: { ok: true as const, reservation: result.value.reservation, data: next } };
    });
    const publicData = toPublicData(outcome.data, clock());
    if (outcome.ok) email.notify(emails(outcome.reservation, clock()));
    if (outcome.ok) send(res, 200, { ok: true, reservation: outcome.reservation, data: publicData });
    else send(res, 422, { ok: false, errors: outcome.errors, data: publicData });
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string) {
    const method = req.method ?? 'GET';
    if (method !== 'GET') assertSameOrigin(req);

    if (method === 'GET' && path === '/api/health') return send(res, 200, { ok: true });

    if (method === 'GET' && path === '/api/public/data') {
      return send(res, 200, toPublicData(await store.load(), clock()));
    }

    if (method === 'GET' && path === '/api/public/features') {
      return send(res, 200, { email: email.enabled });
    }

    if (method === 'POST' && path === '/api/public/reservations') {
      limit(bookingLimiter, req);
      const input = parse(bookingSchema, await readJson(req, PUBLIC_BODY_LIMIT));
      const address = input.customer.email.trim();
      if (config.emailDomainCheck && isValidEmail(address)) {
        const problem = await config.emailDomainCheck(address);
        if (problem) return send(res, 422, { ok: false, errors: [problem], data: toPublicData(await store.load(), clock()) });
      }
      return publicCommand(
        res,
        (data, nowMs) => createReservation(data, buildOnlineDraft(data, input), nowMs, { channel: 'online' }),
        confirmationJobs,
      );
    }

    if (method === 'POST' && path === '/api/public/lookup') {
      limit(lookupLimiter, req);
      const { code, email } = parse(lookupSchema, await readJson(req, PUBLIC_BODY_LIMIT));
      return send(res, 200, { reservation: findByCodeAndEmail(await store.load(), code, email) ?? null });
    }

    if (method === 'POST' && path === '/api/public/cancel') {
      limit(lookupLimiter, req);
      const { code, email } = parse(lookupSchema, await readJson(req, PUBLIC_BODY_LIMIT));
      return publicCommand(res, (data, nowMs) => {
        const found = findByCodeAndEmail(data, code, email);
        return found ? cancelByCustomer(data, found.id, nowMs) : { ok: false, errors: [err('NOT_FOUND')] };
      }, cancellationJobs);
    }

    if (method === 'GET' && path === '/api/admin/session') return send(res, 200, { authenticated: isAdmin(req) });

    if (method === 'POST' && path === '/api/admin/login') {
      limit(loginLimiter, req);
      const { password } = parse(loginSchema, await readJson(req, PUBLIC_BODY_LIMIT));
      if (!passwordMatches(password, config.adminPassword, config.sessionSecret)) throw new HttpError(401, 'senha incorreta');
      return send(res, 200, { ok: true }, {
        'Set-Cookie': sessionCookie(createSessionToken(clock(), config.sessionSecret), SESSION_HOURS * 3600),
      });
    }

    if (method === 'POST' && path === '/api/admin/logout') {
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    }

    if (path.startsWith('/api/admin/')) {
      if (!isAdmin(req)) throw new HttpError(401, 'login necessário');

      if (method === 'GET' && path === '/api/admin/data') return send(res, 200, await store.load());

      if (method === 'PUT' && path === '/api/admin/data') {
        const { baseRevision, data } = parse(saveSchema, await readJson(req, ADMIN_BODY_LIMIT));
        const validated = validateDemoData(data);
        if (!validated.ok || validated.data.revision <= baseRevision) throw new HttpError(400, 'dados inválidos');
        const saved = await store.replace(baseRevision, validated.data);
        if (saved.ok) email.notify(diffEmailJobs(saved.previous, validated.data, clock()));
        return saved.ok
          ? send(res, 200, { ok: true, revision: validated.data.revision })
          : send(res, 409, { ok: false, conflict: true, data: saved.current });
      }

      if (method === 'GET' && path === '/api/admin/emails') {
        const reservationId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('reservationId') ?? '';
        if (!reservationId || reservationId.length > 100) throw new HttpError(400, 'reserva não informada');
        const emails = await email.history(reservationId);
        return send(res, 200, {
          enabled: email.enabled,
          emails: emails.map(({ kind, status, attempts, createdAt, sentAt, lastError }) => ({
            kind,
            status,
            attempts,
            createdAt,
            sentAt,
            lastError,
          })),
        });
      }
    }

    throw new HttpError(404, 'não encontrado');
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, path: string) {
    if (!staticRoot || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404).end();
      return;
    }
    const requested = normalize(join(staticRoot, path));
    const inside = requested === staticRoot || requested.startsWith(staticRoot + sep);
    let file = inside && existsSync(requested) && statSync(requested).isFile() ? requested : null;
    if (!file) {
      // Arquivo inexistente com extensão: 404. Rotas do site (sem extensão): index.html.
      if (extname(path)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
        return;
      }
      file = join(staticRoot, 'index.html');
    }
    const immutable = path.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : file.endsWith('index.html') ? 'no-cache' : 'public, max-age=86400',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  }

  return async function handler(req: IncomingMessage, res: ServerResponse) {
    let path = '/';
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    securityHeaders(res, path);
    if (!path.startsWith('/api/')) return serveStatic(req, res, path);
    try {
      await api(req, res, path);
    } catch (error) {
      if (error instanceof HttpError) return send(res, error.status, { error: error.message });
      console.error(error);
      send(res, 500, { error: 'erro interno' });
    }
  };
}
