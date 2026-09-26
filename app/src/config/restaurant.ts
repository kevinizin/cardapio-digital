/**
 * Contatos oficiais do Aromas da Vivi exibidos no site público.
 *
 * Um campo `null` simplesmente não aparece. Preencha aqui (e só aqui) quando
 * os dados forem confirmados, por exemplo `phone: '+33 1 23 45 67 89'` ou
 * `instagram: 'aromasdavivi'` (sem @). `whatsapp` vai no formato E.164
 * (`+33771857403`) e vira um link wa.me.
 */
export interface RestaurantContact {
  address: string | null;
  /** Link do mapa para o endereço (Google Maps). */
  mapsUrl: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  whatsapp: string | null;
}

export const RESTAURANT_CONTACT: RestaurantContact = {
  address: '20 Avenue Duquesne, 75007 Paris',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Aromas+da+Vivi+20+Avenue+Duquesne+75007+Paris',
  phone: null,
  email: null,
  instagram: 'aromasdavivi',
  whatsapp: '+33771857403',
};

export const hasContact = (contact: RestaurantContact = RESTAURANT_CONTACT) =>
  Boolean(contact.address || contact.phone || contact.email || contact.instagram || contact.whatsapp);

/** Link wa.me (só dígitos, sem +). */
export const whatsappUrl = (e164: string) => `https://wa.me/${e164.replace(/\D/g, '')}`;

/** Exibição do número: franceses como +33 7 71 85 74 03; outros ficam como informados. */
export function formatWhatsapp(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('33') && digits.length === 11) {
    const rest = digits.slice(3);
    return `+33 ${digits[2]} ${rest.match(/.{2}/g)?.join(' ') ?? rest}`;
  }
  return e164;
}
