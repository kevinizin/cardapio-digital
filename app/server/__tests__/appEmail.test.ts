import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at, baseData } from '../../src/domain/__tests__/fixtures';
import { err } from '../../src/domain/errors';
import type { DemoData, Reservation } from '../../src/domain/types';
import { createHandler, type AppConfig } from '../app';
import { MemoryEmailLog } from '../email/log';
import { FakeMailer } from '../email/mailer';
import { EmailService } from '../email/service';
import { MemoryStateStore } from '../state';

const NOW = at('2026-09-15', '12:00');
const PASSWORD = 'senha-muito-secreta';
const SECRET = 'x'.repeat(32);
const servers: Server[] = [];
const silent = { error: () => undefined, log: () => undefined };

async function start(options: { email?: boolean; domainCheck?: AppConfig['emailDomainCheck'] } = {}) {
  const store = new MemoryStateStore(baseData());
  const mailer = new FakeMailer();
  const log = new MemoryEmailLog();
  const email = options.email === false ? undefined : new EmailService({ mailer, log, store, publicUrl: 'https://x.test', clock: () => NOW, logger: silent });
  const handler = createHandler({
    store,
    adminPassword: PASSWORD,
    sessionSecret: SECRET,
    clock: () => NOW,
    email,
    emailDomainCheck: options.domainCheck,
  });
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const loginCookie = async () => {
    const response = await post('/api/admin/login', { password: PASSWORD });
    return (response.headers.get('set-cookie') ?? '').split(';')[0];
  };
  return { store, mailer, log, base, post, loginCookie };
}

afterEach(() => {
  servers.splice(0).forEach((server) => server.close());
});

const booking = {
  date: '2026-09-16',
  time: '20:00',
  partySize: 2,
  customer: { name: 'Ana Teste', email: 'ana@example.com', phone: '+33 6 00 00 00 00', notes: '' },
};

describe('recursos públicos', () => {
  it('informa se os e-mails estão ativos', async () => {
    const on = await start();
    expect(await (await fetch(`${on.base}/api/public/features`)).json()).toEqual({ email: true });
    const off = await start({ email: false });
    expect(await (await fetch(`${off.base}/api/public/features`)).json()).toEqual({ email: false });
  });
});

describe('e-mails nas reservas online', () => {
  it('reserva online: guarda idioma e aceite (com instante do servidor) e envia a confirmação no idioma', async () => {
    const { post, mailer, store } = await start();
    const response = await post('/api/public/reservations', {
      ...booking,
      locale: 'pt',
      customer: { ...booking.customer, marketingOptIn: true, marketingOptInAt: '2000-01-01T00:00:00.000Z' },
    });
    expect(response.status).toBe(200);
    const saved = (await store.load()).reservations[0];
    expect(saved.locale).toBe('pt');
    expect(saved.customer.marketingOptIn).toBe(true);
    expect(saved.customer.marketingOptInAt).toBe(new Date(NOW).toISOString());
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1));
    expect(mailer.sent[0].subject).toMatch(/^Reserva confirmada/);
    expect(mailer.sent[0].to.email).toBe('ana@example.com');
    expect(mailer.sent[0].html).toContain(saved.code);
  });

  it('sem aceite, nada de marketing é guardado; sem idioma, o e-mail sai em francês', async () => {
    const { post, mailer, store } = await start();
    await post('/api/public/reservations', { ...booking, customer: { ...booking.customer, marketingOptIn: false } });
    const saved = (await store.load()).reservations[0];
    expect(saved.customer).not.toHaveProperty('marketingOptIn');
    expect(saved.customer).not.toHaveProperty('marketingOptInAt');
    expect(saved).not.toHaveProperty('locale');
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1));
    expect(mailer.sent[0].subject).toMatch(/^Réservation confirmée/);
  });

  it('cancelamento pelo cliente envia o e-mail de cancelamento', async () => {
    const { post, mailer } = await start();
    const created = (await (await post('/api/public/reservations', { ...booking, locale: 'en' })).json()) as { reservation: Reservation };
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1));
    const cancelled = await post('/api/public/cancel', { code: created.reservation.code, email: 'ana@example.com' });
    expect(cancelled.status).toBe(200);
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(2));
    expect(mailer.sent[1].subject).toMatch(/^Booking cancelled/);
  });

  it('falha no envio não afeta a resposta da reserva', async () => {
    const { post, mailer, log } = await start();
    mailer.failures = [true];
    const response = await post('/api/public/reservations', booking);
    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(log.entries[0]?.status).toBe('failed'));
  });

  it('e-mail temporário ou domínio inexistente: 422 no campo e-mail e nada é gravado', async () => {
    const domainCheck = vi.fn(async (email: string) =>
      email.endsWith('@mailinator.com') ? err('EMAIL_DISPOSABLE', { field: 'email' }) : null,
    );
    const { post, store, mailer } = await start({ domainCheck });
    const response = await post('/api/public/reservations', { ...booking, customer: { ...booking.customer, email: 'x@mailinator.com' } });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { errors: { code: string; field: string }[]; data: DemoData };
    expect(body.errors).toEqual([{ code: 'EMAIL_DISPOSABLE', field: 'email' }]);
    expect(body.data.revision).toBe(1);
    expect((await store.load()).reservations).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
    // Formato inválido nem chega ao DNS: a validação normal responde.
    await post('/api/public/reservations', { ...booking, customer: { ...booking.customer, email: 'sem-arroba' } });
    expect(domainCheck).toHaveBeenCalledTimes(1);
    expect((await post('/api/public/reservations', booking)).status).toBe(200);
  });
});

describe('e-mails a partir da administração', () => {
  async function save(base: string, cookie: string, change: (data: DemoData) => DemoData) {
    const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const current = (await (await fetch(`${base}/api/admin/data`, { headers })).json()) as DemoData;
    const next = { ...change(current), revision: current.revision + 1 };
    const response = await fetch(`${base}/api/admin/data`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ baseRevision: current.revision, data: next }),
    });
    expect(response.status).toBe(200);
  }

  it('alteração de horário e cancelamento pela equipe geram e-mails (sem o motivo interno)', async () => {
    const { post, base, mailer, store, loginCookie } = await start();
    await post('/api/public/reservations', { ...booking, locale: 'fr' });
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1));
    const cookie = await loginCookie();

    await save(base, cookie, (data) => ({
      ...data,
      reservations: data.reservations.map((r) => ({ ...r, startAt: new Date(at('2026-09-16', '20:30')).toISOString() })),
    }));
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(2));
    expect(mailer.sent[1].subject).toMatch(/^Réservation modifiée · mercredi 16 septembre à 20:30/);

    await save(base, cookie, (data) => ({
      ...data,
      reservations: data.reservations.map((r) => ({
        ...r,
        status: 'cancelled' as const,
        cancelledAt: new Date(NOW).toISOString(),
        cancelledBy: 'admin' as const,
        cancelReason: 'Motivo interno confidencial',
      })),
    }));
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(3));
    expect(mailer.sent[2].subject).toMatch(/^Réservation annulée/);
    expect(mailer.sent[2].html).not.toContain('Motivo interno');

    const id = (await store.load()).reservations[0].id;
    const history = await fetch(`${base}/api/admin/emails?reservationId=${encodeURIComponent(id)}`, { headers: { Cookie: cookie } });
    const body = (await history.json()) as { enabled: boolean; emails: { kind: string; status: string }[] };
    expect(body.enabled).toBe(true);
    expect(body.emails.map((e) => `${e.kind}:${e.status}`)).toEqual(['confirm:sent', 'change:sent', 'cancel:sent']);
  });

  it('histórico de e-mails exige login', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/admin/emails?reservationId=x`)).status).toBe(401);
  });

  it('a gravação da administração guarda idioma e aceite de novidades', async () => {
    const { post, base, store, loginCookie } = await start({ email: false });
    await post('/api/public/reservations', { ...booking, locale: 'en', customer: { ...booking.customer, marketingOptIn: true } });
    const cookie = await loginCookie();
    await save(base, cookie, (data) => ({ ...data, reservations: data.reservations.map((r) => ({ ...r, partySize: 3 })) }));
    const saved = (await store.load()).reservations[0];
    expect(saved.partySize).toBe(3);
    expect(saved.locale).toBe('en');
    expect(saved.customer.marketingOptIn).toBe(true);
  });
});
