import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'adm_session';
export const SESSION_HOURS = 12;

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Compara a senha sem vazar o tempo de comparação (inclusive o tamanho). */
export function passwordMatches(input: string, expected: string, secret: string): boolean {
  return safeEqual(sign(input, secret), sign(expected, secret));
}

export function createSessionToken(nowMs: number, secret: string): string {
  const expires = String(nowMs + SESSION_HOURS * 3_600_000);
  return `${expires}.${sign(expires, secret)}`;
}

export function isValidSession(token: string | undefined, nowMs: number, secret: string): boolean {
  if (!token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature || !safeEqual(signature, sign(expires, secret))) return false;
  return Number(expires) > nowMs;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

/** Limite simples por chave (ex.: IP) numa janela de tempo, em memória. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Registra uma tentativa; retorna false se o limite já foi atingido. */
  take(key: string, nowMs: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((at) => at > nowMs - this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(nowMs);
    return true;
  }

  private prune(nowMs: number) {
    for (const [key, list] of this.hits) {
      if (!list.some((at) => at > nowMs - this.windowMs)) this.hits.delete(key);
    }
  }
}
