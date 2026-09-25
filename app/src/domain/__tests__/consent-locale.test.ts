import { describe, expect, it } from 'vitest';
import { validateDemoData } from '../../data/schema';
import { getBundle } from '../../i18n/dictionaries';
import { buildOnlineDraft, createReservation, draftFromReservation, updateReservation } from '../reservations';
import { at, baseData } from './fixtures';

const NOW = at('2026-09-15', '12:00');
const input = {
  date: '2026-09-16',
  time: '20:00',
  partySize: 2,
  customer: { name: 'Ana Teste', email: 'ana@example.com', phone: '', notes: '' },
};

function create(extra: Partial<typeof input> & { locale?: 'fr' | 'pt' | 'en'; marketingOptIn?: boolean } = {}) {
  const data = baseData();
  const { marketingOptIn, ...rest } = extra;
  const draftInput = { ...input, ...rest, customer: { ...input.customer, ...(marketingOptIn !== undefined ? { marketingOptIn } : {}) } };
  const result = createReservation(data, buildOnlineDraft(data, draftInput), NOW, { channel: 'online' });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

describe('idioma e aceite de novidades na reserva', () => {
  it('guarda o idioma e o instante do aceite na criação', () => {
    const { reservation } = create({ locale: 'en', marketingOptIn: true });
    expect(reservation.locale).toBe('en');
    expect(reservation.customer.marketingOptIn).toBe(true);
    expect(reservation.customer.marketingOptInAt).toBe(new Date(NOW).toISOString());
  });

  it('sem aceite, nenhum campo de marketing é guardado', () => {
    const { reservation } = create({ marketingOptIn: false });
    expect(reservation.customer).toEqual(input.customer);
    expect(reservation).not.toHaveProperty('locale');
  });

  it('a edição pela equipe preserva idioma e aceite', () => {
    const { data, reservation } = create({ locale: 'pt', marketingOptIn: true });
    const draft = draftFromReservation(reservation);
    const edited = updateReservation(
      data,
      reservation.id,
      { ...draft, time: '20:15', customer: { name: 'Ana T.', email: 'ana@example.com', phone: '', notes: '' } },
      NOW,
    );
    if (!edited.ok) throw new Error(`edição recusada: ${JSON.stringify(edited.errors)}`);
    expect(edited.value.reservation.locale).toBe('pt');
    expect(edited.value.reservation.customer).toMatchObject({ name: 'Ana T.', marketingOptIn: true, marketingOptInAt: reservation.customer.marketingOptInAt });
    expect(edited.value.changes.map((c) => c.field)).toEqual(['time', 'name']);
  });

  it('o esquema aceita dados antigos (sem os campos) e novos (com os campos), e recusa idioma desconhecido', () => {
    const plain = create();
    const full = create({ locale: 'fr', marketingOptIn: true });
    expect(validateDemoData(plain.data).ok).toBe(true);
    const validated = validateDemoData(full.data);
    expect(validated.ok && validated.data.reservations[0]).toMatchObject({ locale: 'fr', customer: { marketingOptIn: true } });
    const bad = { ...full.data, reservations: [{ ...full.reservation, locale: 'de' }] };
    expect(validateDemoData(bad).ok).toBe(false);
  });

  it('mensagens dos novos erros de e-mail nos três idiomas', () => {
    for (const locale of ['pt', 'fr', 'en'] as const) {
      const { errorMessage } = getBundle(locale);
      expect(errorMessage({ code: 'EMAIL_DISPOSABLE' })).toMatch(/tempor/i);
      expect(errorMessage({ code: 'EMAIL_DOMAIN_INVALID' })).toMatch(/domain|domínio|domaine/i);
    }
  });
});
