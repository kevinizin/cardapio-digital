import { describe, expect, it } from 'vitest';
import { createFormatters } from '../format';
import { getBundle, PUBLIC_MESSAGES } from '../dictionaries';
import { detectLocale, initialLocale, LOCALE_STORAGE_KEY, LOCALES, readStoredLocale, storeLocale } from '../locale';

/** Estrutura de um dicionário: caminho → tipo (e tamanho, para listas). */
function shape(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return [`${path}:array(${value.length})`];
  if (typeof value === 'function') return [`${path}:function`];
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .flatMap((key) => shape((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key));
  }
  return [`${path}:${typeof value}`];
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

const brokenStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('detecção do idioma', () => {
  it('usa francês por padrão', () => {
    expect(detectLocale(null, 'fr-FR')).toBe('fr');
    expect(detectLocale(null, 'de-DE')).toBe('fr');
    expect(detectLocale(null, undefined)).toBe('fr');
    expect(detectLocale(null, '')).toBe('fr');
  });

  it('segue o navegador em português ou inglês', () => {
    expect(detectLocale(null, 'pt-BR')).toBe('pt');
    expect(detectLocale(null, 'pt-PT')).toBe('pt');
    expect(detectLocale(null, 'PT')).toBe('pt');
    expect(detectLocale(null, 'en-US')).toBe('en');
    expect(detectLocale(null, 'en')).toBe('en');
  });

  it('a escolha salva vence o navegador; valores inválidos são ignorados', () => {
    expect(detectLocale('en', 'pt-BR')).toBe('en');
    expect(detectLocale('pt', 'fr-FR')).toBe('pt');
    expect(detectLocale('es', 'pt-BR')).toBe('pt');
    expect(detectLocale('', 'de')).toBe('fr');
  });

  it('salva e relê a escolha', () => {
    const storage = memoryStorage();
    storeLocale('en', storage);
    expect(storage.map.get(LOCALE_STORAGE_KEY)).toBe('en');
    expect(readStoredLocale(storage)).toBe('en');
    expect(initialLocale(storage)).toBe('en');
  });

  it('armazenamento indisponível não quebra: volta à detecção pelo navegador', () => {
    expect(() => storeLocale('pt', brokenStorage)).not.toThrow();
    expect(readStoredLocale(brokenStorage)).toBeNull();
    expect(readStoredLocale(null)).toBeNull();
    expect(['fr', 'pt', 'en']).toContain(initialLocale(brokenStorage));
    expect(initialLocale(memoryStorage({ [LOCALE_STORAGE_KEY]: 'xx' }))).toBe(detectLocale(null, globalThis.navigator?.language));
  });
});

describe('dicionários do site público', () => {
  it('os três idiomas têm exatamente as mesmas chaves', () => {
    const reference = shape(PUBLIC_MESSAGES.pt);
    expect(reference.length).toBeGreaterThan(100);
    for (const locale of LOCALES) expect(shape(PUBLIC_MESSAGES[locale])).toEqual(reference);
  });

  it('nenhum texto fica vazio e as funções devolvem texto', () => {
    for (const locale of LOCALES) {
      const { t } = getBundle(locale);
      expect(t.public.home.roomText(3, 12)).toMatch(/3 .*12 /);
      expect(t.common.people(1)).toMatch(/^1 /);
      expect(t.public.booking.dayStatus.open(2)).toContain('2');
      const strings = JSON.stringify(t, (_, value) => value);
      expect(strings).not.toContain('""');
    }
  });

  it('aviso de fechamento nos três idiomas', () => {
    const fr = getBundle('fr').t.public.notice;
    const pt = getBundle('pt').t.public.notice;
    const en = getBundle('en').t.public.notice;
    expect(fr.closedToday(null)).toBe('Aujourd’hui, nous sommes fermés.');
    expect(fr.closedToday('Congés annuels')).toBe('Aujourd’hui, nous sommes fermés — Congés annuels.');
    expect(fr.reopen('Mardi', '30/09', '12:00', false)).toBe('Réouverture le mardi 30/09 à 12:00.');
    expect(fr.upcomingRange('lun. 10/08', 'lun. 24/08', 'Travaux !')).toBe('Attention\u00a0: fermé du lun. 10/08 au lun. 24/08 — Travaux !');
    expect(pt.closedToday(null)).toBe('Hoje estamos fechados.');
    expect(pt.reopen('Terça-feira', '30/09', '12:00', false)).toBe('Voltamos terça-feira, 30/09, às 12:00.');
    expect(en.closedToday(null)).toBe('We’re closed today.');
    expect(en.reopen('Tuesday', '30/09', '12:00', true)).toBe('We reopen tomorrow, Tuesday 30/09, at 12:00.');
  });

  it('francês e inglês não carregam textos em português', () => {
    const { t: fr } = getBundle('fr');
    const { t: en } = getBundle('en');
    expect(fr.public.home.heading).not.toBe(PUBLIC_MESSAGES.pt.public.home.heading);
    expect(en.public.booking.confirm).toBe('Confirm booking');
    expect(fr.public.booking.confirm).toBe('Confirmer la réservation');
  });

  it('mensagens de erro existem em cada idioma', () => {
    const error = { code: 'EMAIL_INVALID' as const };
    expect(getBundle('pt').errorMessage(error)).toMatch(/e-mail válido/);
    expect(getBundle('fr').errorMessage(error)).toMatch(/e-mail valide/);
    expect(getBundle('en').errorMessage(error)).toMatch(/valid email/);
    expect(getBundle('fr').errorMessage({ code: 'CANCEL_DEADLINE_PASSED', params: { minutes: 120 } })).toContain('2 h');
    expect(getBundle('en').errorMessage({ code: 'CANCEL_DEADLINE_PASSED', params: { minutes: 120 } })).toContain('2 hours');
  });
});

describe('formatação por idioma (fuso de Paris, 24 h)', () => {
  const fr = createFormatters('fr');
  const en = createFormatters('en');
  const pt = createFormatters('pt');
  // 15/09/2026 19:30 em Paris (UTC+2) = 17:30 UTC; os testes rodam em São Paulo.
  const ms = Date.UTC(2026, 8, 15, 17, 30);

  it('francês', () => {
    expect(fr.formatLocalDateLong('2026-09-15')).toBe('Mardi 15/09/2026');
    expect(fr.formatLocalDateCompact('2026-09-15')).toBe('mar. 15/09');
    expect(fr.formatLocalDateSpoken('2026-09-15')).toBe('mardi 15 septembre 2026');
    expect(fr.formatMonth('2026-09')).toBe('Septembre 2026');
    expect(fr.formatDateTime(ms)).toBe('15/09/2026 à 19:30');
    expect(fr.formatTime(ms)).toBe('19:30');
    expect(fr.formatDuration(90)).toBe('1 h 30');
    expect(fr.formatDuration(120)).toBe('2 h');
  });

  it('inglês', () => {
    expect(en.formatLocalDateLong('2026-09-15')).toBe('Tuesday, 15/09/2026');
    expect(en.formatLocalDateCompact('2026-09-15')).toBe('Tue, 15/09');
    expect(en.formatLocalDateSpoken('2026-09-15')).toBe('Tuesday 15 September 2026');
    expect(en.formatMonth('2026-09')).toBe('September 2026');
    expect(en.formatDateTime(ms)).toBe('15/09/2026 at 19:30');
    expect(en.formatTime(Date.UTC(2026, 11, 15, 22, 5))).toBe('23:05');
    expect(en.formatDuration(90)).toBe('1 h 30 min');
  });

  it('português continua igual', () => {
    expect(pt.formatLocalDateLong('2026-09-15')).toBe('Terça-feira, 15/09/2026');
    expect(pt.formatMonth('2026-09')).toBe('Setembro de 2026');
    expect(pt.formatDateTime(ms)).toBe('15/09/2026 às 19:30');
    expect(pt.formatDuration(90)).toBe('1h30');
  });
});
