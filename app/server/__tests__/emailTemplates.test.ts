import { describe, expect, it } from 'vitest';
import { iso, makeReservation } from '../../src/domain/__tests__/fixtures';
import { CUSTOMER_LOCALES, type Reservation } from '../../src/domain/types';
import { EMAIL_COPY, type EmailKind } from '../email/messages';
import { escapeHtml, formatWhen, manageUrl, renderEmail } from '../email/templates';

const PUBLIC_URL = 'https://reservas.example.test';
const context = { publicUrl: PUBLIC_URL, customerCancelMinutes: 120 };
const KINDS: EmailKind[] = ['confirm', 'change', 'cancel', 'reminder'];

function reservation(partial: Partial<Reservation> = {}): Reservation {
  return makeReservation({
    code: 'K7M2QX',
    tableId: 'SALAO',
    startAt: iso('2026-09-15', '19:30'),
    partySize: 4,
    customer: { name: 'Ana Souza', email: 'ana@example.com', phone: '', notes: '' },
    ...partial,
  });
}

/** Estrutura de um objeto de textos (caminho → tipo). */
function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path}:function`];
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .flatMap((key) => shape((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key));
  }
  return [`${path}:${typeof value}`];
}

describe('textos dos e-mails', () => {
  it('os três idiomas têm as mesmas chaves e nenhum texto vazio', () => {
    const reference = shape(EMAIL_COPY.pt);
    for (const locale of CUSTOMER_LOCALES) {
      expect(shape(EMAIL_COPY[locale])).toEqual(reference);
      expect(JSON.stringify(EMAIL_COPY[locale])).not.toContain('""');
    }
  });
});

describe('renderização dos e-mails', () => {
  it('francês por padrão, com data longa, horário de Paris e pessoas', () => {
    const email = renderEmail('confirm', reservation(), context);
    expect(email.subject).toBe('Réservation confirmée · mardi 15 septembre à 19:30 · Aromas da Vivi');
    expect(email.html).toContain('<html lang="fr"');
    expect(email.html).toContain('Mardi 15 septembre 2026');
    expect(email.html).toContain('19:30 (heure de Paris)');
    expect(email.html).toContain('4 personnes');
    expect(email.html).toContain('Bonjour Ana,');
    expect(email.text).toContain('Code de réservation: K7M2QX');
    expect(email.text).toContain('jusqu’à 2 h avant');
  });

  it('português e inglês', () => {
    const pt = renderEmail('reminder', reservation({ locale: 'pt' }), context);
    expect(pt.subject).toBe('Até amanhã! Sua mesa · terça-feira, 15 de setembro, às 19:30 · Aromas da Vivi');
    expect(pt.html).toContain('Terça-feira, 15 de setembro de 2026');
    expect(pt.html).toContain('19:30 (horário de Paris)');
    expect(pt.text).toContain('até 2h antes');
    const en = renderEmail('confirm', reservation({ locale: 'en', partySize: 1 }), context);
    expect(en.subject).toBe('Booking confirmed · Tuesday 15 September at 19:30 · Aromas da Vivi');
    expect(en.html).toContain('1 guest<');
    expect(en.html).toContain('Tuesday 15 September 2026');
  });

  it('horário de Paris no inverno (UTC+1), mesmo com o servidor em outro fuso', () => {
    const winter = reservation({ startAt: iso('2026-12-15', '20:00') });
    expect(new Date(winter.startAt).getUTCHours()).toBe(19);
    expect(renderEmail('confirm', winter, context).html).toContain('20:00 (heure de Paris)');
    expect(formatWhen(Date.parse(winter.startAt), 'en')).toBe('Tuesday 15 December at 20:00');
  });

  it('escapa os dados informados pelo cliente', () => {
    const hostile = reservation({
      customer: { name: '<script>alert(1)</script> "Zé"', email: 'a"b@example.com', phone: '', notes: '<b>x</b>' },
    });
    for (const kind of KINDS) {
      const { html } = renderEmail(kind, hostile, context);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('a"b@example.com');
      expect(html).not.toContain('<b>x</b>');
    }
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('links absolutos: consulta com código e e-mail, mapa, WhatsApp e logo', () => {
    const r = reservation();
    const { html, text } = renderEmail('confirm', r, context);
    const manage = `${PUBLIC_URL}/consultar?codigo=K7M2QX&email=ana%40example.com`;
    expect(manageUrl(PUBLIC_URL, r)).toBe(manage);
    expect(html).toContain(`href="${manage.replace(/&/g, '&amp;')}"`);
    expect(text).toContain(manage);
    expect(html).toContain(`src="${PUBLIC_URL}/brand/logo-email.png"`);
    expect(html).toContain('https://www.google.com/maps/search/?api=1&amp;query=');
    expect(html).toContain('https://wa.me/33771857403');
    expect(html).toContain('+33 7 71 85 74 03');
    expect(html).toContain('20 Avenue Duquesne, 75007 Paris');
  });

  it('cancelamento: sem link de gerenciar, com link para reservar de novo e sem o motivo interno', () => {
    const cancelled = reservation({ status: 'cancelled', cancelledBy: 'admin', cancelReason: 'Cliente grosseiro ao telefone', locale: 'pt' });
    const { html, text, subject } = renderEmail('cancel', cancelled, context);
    expect(subject).toMatch(/^Reserva cancelada/);
    expect(html).not.toContain('Cliente grosseiro');
    expect(text).not.toContain('Cliente grosseiro');
    expect(html).not.toContain('/consultar?');
    expect(html).toContain(`${PUBLIC_URL}/reservar`);
    expect(html).toContain('precisamos cancelar');
    const byCustomer = renderEmail('cancel', { ...cancelled, cancelledBy: 'customer' }, context);
    expect(byCustomer.html).toContain('Como você pediu');
  });

  it('cada tipo tem assunto próprio e versão em texto simples', () => {
    const subjects = new Set(KINDS.map((kind) => renderEmail(kind, reservation({ locale: 'en' }), context).subject));
    expect(subjects.size).toBe(4);
    for (const kind of KINDS) {
      const { text } = renderEmail(kind, reservation(), context);
      expect(text).not.toMatch(/<[a-z]/i);
      expect(text).toContain('K7M2QX');
    }
  });
});
