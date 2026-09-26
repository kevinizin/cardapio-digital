import { describe, expect, it, vi } from 'vitest';
import { at, baseData, iso, makeReservation } from '../../src/domain/__tests__/fixtures';
import type { Reservation } from '../../src/domain/types';
import { MAX_ATTEMPTS, MemoryEmailLog } from '../email/log';
import { BREVO_ENDPOINT, BrevoMailer, DEFAULT_PUBLIC_URL, emailSetupFromEnv, FakeMailer } from '../email/mailer';
import { backoffMs, EmailService } from '../email/service';
import { jobFor } from '../email/triggers';
import { MemoryStateStore } from '../state';

const MINUTE = 60_000;
const silent = { error: () => undefined, log: () => undefined };

function setup(reservations: Reservation[], start = at('2026-09-15', '12:00')) {
  let now = start;
  const store = new MemoryStateStore(baseData({ reservations }));
  const mailer = new FakeMailer();
  const log = new MemoryEmailLog();
  const service = new EmailService({ mailer, log, store, publicUrl: 'https://x.test', clock: () => now, logger: silent });
  return { store, mailer, log, service, advance: (ms: number) => (now += ms), setNow: (ms: number) => (now = ms) };
}

const reservation = (partial: Partial<Reservation> = {}) =>
  makeReservation({ tableId: 'SALAO', startAt: iso('2026-09-16', '20:00'), createdAt: iso('2026-09-01', '12:00'), ...partial });

describe('fila de e-mails', () => {
  it('envia a confirmação e registra como enviada', async () => {
    const r = reservation({ locale: 'en' });
    const { service, mailer, log } = setup([r]);
    await service.enqueue([jobFor('confirm', r)]);
    await service.processDue();
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toEqual({ email: r.customer.email, name: r.customer.name });
    expect(mailer.sent[0].subject).toMatch(/^Booking confirmed/);
    expect(log.entries[0]).toMatchObject({ status: 'sent', attempts: 1, lastError: null });
    await service.processDue();
    expect(mailer.sent).toHaveLength(1);
  });

  it('falhas: nova tentativa com espera crescente, até 5 tentativas', async () => {
    const r = reservation();
    const { service, mailer, log, advance } = setup([r]);
    mailer.failures = [true, true, true, true, true];
    await service.enqueue([jobFor('confirm', r)]);

    await service.processDue();
    expect(log.entries[0]).toMatchObject({ status: 'failed', attempts: 1, lastError: 'falha simulada' });
    // Antes da espera, nada é reenviado.
    advance(30_000);
    await service.processDue();
    expect(log.entries[0].attempts).toBe(1);

    const waits = [1, 5, 15, 60];
    advance(30_000); // completa 1 min
    await service.processDue();
    expect(log.entries[0].attempts).toBe(2);
    for (const wait of waits.slice(1)) {
      advance(wait * MINUTE);
      await service.processDue();
    }
    expect(log.entries[0]).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
    // Depois de 5 tentativas, desiste.
    advance(24 * 60 * MINUTE);
    await service.processDue();
    expect(log.entries[0].attempts).toBe(MAX_ATTEMPTS);
    expect(mailer.sent).toHaveLength(0);
  });

  it('volta a funcionar depois de uma falha', async () => {
    const r = reservation();
    const { service, mailer, log, advance } = setup([r]);
    mailer.failures = [true];
    await service.enqueue([jobFor('confirm', r)]);
    await service.processDue();
    advance(backoffMs(1));
    await service.processDue();
    expect(mailer.sent).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('espera entre tentativas: 1, 5, 15 e 60 min', () => {
    expect([1, 2, 3, 4, 5].map((n) => backoffMs(n) / MINUTE)).toEqual([1, 5, 15, 60, 60]);
  });

  it('descarta e-mails que não valem mais (cancelada antes do envio, reserva no passado)', async () => {
    const r = reservation();
    const past = reservation({ startAt: iso('2026-09-15', '11:00') });
    const { service, mailer, log, store } = setup([r, past]);
    await service.enqueue([jobFor('confirm', r), jobFor('confirm', past)]);
    await store.update((data) => ({
      data: { ...data, reservations: data.reservations.map((x) => (x.id === r.id ? { ...x, status: 'cancelled' as const } : x)) },
      result: null,
    }));
    await service.processDue();
    expect(mailer.sent).toHaveLength(0);
    expect(log.entries.map((e) => e.status)).toEqual(['skipped', 'skipped']);
  });

  it('o trabalho periódico agenda o lembrete uma única vez', async () => {
    const r = reservation({ locale: 'pt' });
    const { service, mailer, setNow } = setup([r], at('2026-09-15', '09:00'));
    await service.tick();
    expect(mailer.sent).toHaveLength(0);
    setNow(at('2026-09-15', '10:01'));
    await service.tick();
    await service.tick();
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].subject).toMatch(/^Até amanhã/);
  });

  it('notify nunca lança erro, mesmo com o registro quebrado', async () => {
    const r = reservation();
    const { store, mailer } = setup([r]);
    const errors: unknown[] = [];
    const broken = new MemoryEmailLog();
    broken.enqueue = () => Promise.reject(new Error('banco fora do ar'));
    const service = new EmailService({ mailer, log: broken, store, publicUrl: 'https://x.test', logger: { ...silent, error: (...args: unknown[]) => errors.push(args) } });
    expect(() => service.notify([jobFor('confirm', r)])).not.toThrow();
    await vi.waitFor(() => expect(errors).toHaveLength(1));
  });
});

describe('configuração e Brevo', () => {
  it('sem chave: e-mails desligados; com chave exige remetente', () => {
    expect(emailSetupFromEnv({})).toEqual({ enabled: false, reason: expect.stringContaining('BREVO_API_KEY'), publicUrl: DEFAULT_PUBLIC_URL });
    expect(emailSetupFromEnv({ BREVO_API_KEY: 'k' }).enabled).toBe(false);
    const setup = emailSetupFromEnv({ BREVO_API_KEY: 'k', EMAIL_FROM: 'reservas@aromas.test', PUBLIC_URL: 'https://a.test/' });
    expect(setup).toEqual({
      enabled: true,
      config: { apiKey: 'k', from: 'reservas@aromas.test', fromName: 'Aromas da Vivi', replyTo: undefined, publicUrl: 'https://a.test' },
    });
  });

  it('BrevoMailer envia o formato da API com o cabeçalho api-key', async () => {
    const fetchMock = vi.fn(async () => new Response('{"messageId":"1"}', { status: 201 }));
    const mailer = new BrevoMailer(
      { apiKey: 'segredo', from: 'r@a.test', fromName: 'Aromas da Vivi', replyTo: 'vivi@a.test', publicUrl: 'https://a.test' },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    await mailer.send({ to: { email: 'c@x.test', name: 'Cli' }, subject: 'S', html: '<p>h</p>', text: 't' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(BREVO_ENDPOINT);
    expect((init.headers as Record<string, string>)['api-key']).toBe('segredo');
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { email: 'r@a.test', name: 'Aromas da Vivi' },
      to: [{ email: 'c@x.test', name: 'Cli' }],
      subject: 'S',
      htmlContent: '<p>h</p>',
      textContent: 't',
      replyTo: { email: 'vivi@a.test' },
    });
  });

  it('BrevoMailer: erro HTTP e tempo esgotado viram falha', async () => {
    const config = { apiKey: 'k', from: 'r@a.test', fromName: 'A', publicUrl: 'https://a.test' };
    const rejecting = new BrevoMailer(config, { fetch: (async () => new Response('bad sender', { status: 400 })) as unknown as typeof fetch });
    await expect(rejecting.send({ to: { email: 'c@x.test' }, subject: 's', html: 'h', text: 't' })).rejects.toThrow('Brevo HTTP 400: bad sender');

    const hanging = ((_: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    const slow = new BrevoMailer(config, { fetch: hanging, timeoutMs: 20 });
    await expect(slow.send({ to: { email: 'c@x.test' }, subject: 's', html: 'h', text: 't' })).rejects.toThrow('não respondeu');
  });
});
