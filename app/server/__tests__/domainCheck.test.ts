import { describe, expect, it, vi } from 'vitest';
import { createEmailDomainCheck, isDisposableDomain, loadDisposableDomains, type Resolver } from '../email/domainCheck';

const dnsError = (code: string) => Object.assign(new Error(code), { code });

/** DNS simulado: nenhum acesso à rede nos testes. */
function fakeResolver(table: Record<string, { mx?: string[] | string; a?: string[] | string; aaaa?: string[] | string }>) {
  const answer = <T>(value: string[] | string | undefined, map: (item: string) => T): Promise<T[]> => {
    if (value === undefined) return Promise.reject(dnsError('ENODATA'));
    if (typeof value === 'string') return value === 'HANG' ? new Promise(() => undefined) : Promise.reject(dnsError(value));
    return Promise.resolve(value.map(map));
  };
  const lookup = (domain: string) => table[domain] ?? { mx: 'ENOTFOUND', a: 'ENOTFOUND', aaaa: 'ENOTFOUND' };
  const resolver: Resolver = {
    resolveMx: vi.fn((domain: string) => answer(lookup(domain).mx, (exchange) => ({ exchange, priority: 10 }))),
    resolve4: vi.fn((domain: string) => answer(lookup(domain).a, (ip) => ip)),
    resolve6: vi.fn((domain: string) => answer(lookup(domain).aaaa, (ip) => ip)),
  };
  return resolver;
}

const lists = { exact: new Set(['mailinator.com', 'yopmail.com']), wildcard: new Set(['33m.co']) };

describe('e-mails temporários', () => {
  it('a lista do pacote é carregada uma vez e reconhece domínios conhecidos', () => {
    const loaded = loadDisposableDomains();
    expect(loaded).toBe(loadDisposableDomains());
    expect(loaded.exact.size).toBeGreaterThan(10_000);
    expect(isDisposableDomain('mailinator.com', loaded)).toBe(true);
    expect(isDisposableDomain('yopmail.com', loaded)).toBe(true);
    expect(isDisposableDomain('gmail.com', loaded)).toBe(false);
    expect(isDisposableDomain('orange.fr', loaded)).toBe(false);
  });

  it('subdomínios de domínios temporários também são recusados', () => {
    expect(isDisposableDomain('abc.mailinator.com', lists)).toBe(true);
    expect(isDisposableDomain('x.33m.co', lists)).toBe(true);
    expect(isDisposableDomain('notmailinator.com', lists)).toBe(false);
  });
});

describe('verificação do domínio', () => {
  const resolver = fakeResolver({
    'gmail.com': { mx: ['gmail-smtp-in.l.google.com'] },
    'so-a.fr': { a: ['192.0.2.1'] },
    'so-aaaa.fr': { aaaa: ['2001:db8::1'] },
    'sem-email.fr': {},
    'nullmx.fr': { mx: [''], a: ['192.0.2.2'] },
    'lento.fr': { mx: 'HANG' },
    'servfail.fr': { mx: 'ESERVFAIL' },
    'meio-quebrado.fr': { a: 'ETIMEOUT' },
  });
  const check = createEmailDomainCheck({ resolver, disposable: lists, timeoutMs: 30 });

  it('aceita domínio com MX, ou só com A/AAAA', async () => {
    expect(await check('ana@gmail.com')).toBeNull();
    expect(await check('ana@so-a.fr')).toBeNull();
    expect(await check('ana@so-aaaa.fr')).toBeNull();
    expect(await check('ana@GMAIL.COM')).toBeNull();
  });

  it('recusa temporário, domínio inexistente, sem registros ou com MX nulo sem endereço', async () => {
    expect(await check('x@mailinator.com')).toEqual({ code: 'EMAIL_DISPOSABLE', field: 'email' });
    expect(await check('x@gmial.con')).toEqual({ code: 'EMAIL_DOMAIN_INVALID', field: 'email' });
    expect(await check('x@sem-email.fr')).toEqual({ code: 'EMAIL_DOMAIN_INVALID', field: 'email' });
    // MX nulo, mas com A: segue a regra do A (aceita).
    expect(await check('x@nullmx.fr')).toBeNull();
  });

  it('problemas de DNS (demora, SERVFAIL, timeout) não bloqueiam o cliente', async () => {
    expect(await check('x@lento.fr')).toBeNull();
    expect(await check('x@servfail.fr')).toBeNull();
    expect(await check('x@meio-quebrado.fr')).toBeNull();
  });

  it('guarda o resultado por domínio (com validade) e não guarda falhas de DNS', async () => {
    let now = 0;
    const r = fakeResolver({ 'gmail.com': { mx: ['mx'] }, 'servfail.fr': { mx: 'ESERVFAIL' } });
    const cached = createEmailDomainCheck({ resolver: r, disposable: lists, clock: () => now, okTtlMs: 1000 });
    await cached('a@gmail.com');
    await cached('b@gmail.com');
    expect(r.resolveMx).toHaveBeenCalledTimes(1);
    now = 2000;
    await cached('c@gmail.com');
    expect(r.resolveMx).toHaveBeenCalledTimes(2);
    await cached('a@servfail.fr');
    await cached('b@servfail.fr');
    expect(r.resolveMx).toHaveBeenCalledTimes(4);
    await cached('x@mailinator.com');
    expect(r.resolveMx).toHaveBeenCalledTimes(4);
  });
});
