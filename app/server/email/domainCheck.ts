import { promises as dnsPromises } from 'node:dns';
import { createRequire } from 'node:module';
import { err, type DomainError } from '../../src/domain/errors';

/**
 * Validação do domínio do e-mail nas reservas online:
 * - recusa serviços de e-mail temporário (lista `disposable-email-domains`);
 * - recusa domínios que não existem ou não recebem e-mail (sem MX nem A/AAAA).
 * Falhas de DNS (tempo esgotado, SERVFAIL, rede) **liberam** a reserva: um
 * problema de DNS nunca impede um cliente real de reservar.
 */

export type DomainVerdict = 'ok' | 'disposable' | 'invalid';
export type EmailDomainCheck = (email: string) => Promise<DomainError | null>;

export interface Resolver {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

export interface DomainCheckOptions {
  resolver?: Resolver;
  disposable?: { exact: ReadonlySet<string>; wildcard: ReadonlySet<string> };
  timeoutMs?: number;
  /** Validade do cache para domínios bons e para domínios recusados. */
  okTtlMs?: number;
  badTtlMs?: number;
  clock?: () => number;
}

let disposableCache: { exact: ReadonlySet<string>; wildcard: ReadonlySet<string> } | null = null;

/** Carrega a lista uma única vez (cerca de 120 mil domínios). */
export function loadDisposableDomains(): { exact: ReadonlySet<string>; wildcard: ReadonlySet<string> } {
  if (!disposableCache) {
    const require = createRequire(import.meta.url);
    const exact = require('disposable-email-domains/index.json') as string[];
    const wildcard = require('disposable-email-domains/wildcard.json') as string[];
    disposableCache = { exact: new Set(exact.map((d) => d.toLowerCase())), wildcard: new Set(wildcard.map((d) => d.toLowerCase())) };
  }
  return disposableCache;
}

/** O domínio e seus "pais" (a.b.c.com → a.b.c.com, b.c.com, c.com). */
function domainChain(domain: string): string[] {
  const parts = domain.split('.');
  return parts.slice(0, -1).map((_, index) => parts.slice(index).join('.'));
}

export function isDisposableDomain(domain: string, lists = loadDisposableDomains()): boolean {
  return domainChain(domain).some((candidate) => lists.exact.has(candidate) || lists.wildcard.has(candidate));
}

class DnsTimeout extends Error {
  readonly code = 'ETIMEOUT';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DnsTimeout('DNS demorou demais')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Respostas de DNS que provam que o domínio não recebe e-mail. */
const DEFINITIVE = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);
const codeOf = (error: unknown) => (error && typeof error === 'object' && 'code' in error ? String(error.code) : '');

type Lookup = 'yes' | 'no' | 'unknown';

async function lookup(run: () => Promise<unknown[]>, timeoutMs: number, accept: (records: unknown[]) => boolean): Promise<Lookup> {
  try {
    return accept(await withTimeout(run(), timeoutMs)) ? 'yes' : 'no';
  } catch (error) {
    return DEFINITIVE.has(codeOf(error)) ? 'no' : 'unknown';
  }
}

export async function verifyMailDomain(domain: string, resolver: Resolver, timeoutMs: number): Promise<'ok' | 'invalid' | 'unknown'> {
  // MX "nulo" (RFC 7505: "0 .") declara que o domínio não recebe e-mail.
  const mx = await lookup(() => resolver.resolveMx(domain), timeoutMs, (records) =>
    (records as { exchange: string }[]).some((r) => r.exchange && r.exchange !== '.'),
  );
  if (mx === 'yes') return 'ok';
  if (mx === 'unknown') return 'unknown';
  // Sem MX: o e-mail ainda pode ir para o endereço A/AAAA do domínio.
  const a = await lookup(() => resolver.resolve4(domain), timeoutMs, (records) => records.length > 0);
  if (a === 'yes') return 'ok';
  const aaaa = await lookup(() => resolver.resolve6(domain), timeoutMs, (records) => records.length > 0);
  if (aaaa === 'yes') return 'ok';
  return a === 'unknown' || aaaa === 'unknown' ? 'unknown' : 'invalid';
}

export function createEmailDomainCheck(options: DomainCheckOptions = {}): EmailDomainCheck {
  const resolver = options.resolver ?? dnsPromises;
  const timeoutMs = options.timeoutMs ?? 3_000;
  const okTtl = options.okTtlMs ?? 6 * 3_600_000;
  const badTtl = options.badTtlMs ?? 3_600_000;
  const clock = options.clock ?? Date.now;
  const cache = new Map<string, { verdict: DomainVerdict; expires: number }>();

  const verdictFor = async (domain: string): Promise<DomainVerdict> => {
    if (isDisposableDomain(domain, options.disposable ?? loadDisposableDomains())) return 'disposable';
    const cached = cache.get(domain);
    if (cached && cached.expires > clock()) return cached.verdict;
    const result = await verifyMailDomain(domain, resolver, timeoutMs);
    if (result === 'unknown') return 'ok'; // DNS com problema: não bloqueia e não guarda.
    if (cache.size > 5_000) cache.clear();
    cache.set(domain, { verdict: result, expires: clock() + (result === 'ok' ? okTtl : badTtl) });
    return result;
  };

  return async (email: string) => {
    const at = email.lastIndexOf('@');
    const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
    if (at < 1 || !domain.includes('.')) return null; // Formato inválido fica para a validação do cliente.
    const verdict = await verdictFor(domain);
    if (verdict === 'disposable') return err('EMAIL_DISPOSABLE', { field: 'email' });
    if (verdict === 'invalid') return err('EMAIL_DOMAIN_INVALID', { field: 'email' });
    return null;
  };
}
