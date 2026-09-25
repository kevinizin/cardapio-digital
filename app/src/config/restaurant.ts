/**
 * Contatos oficiais do Aromas da Vivi exibidos no site público.
 *
 * Todos ficam `null` até o restaurante confirmar os dados: um campo `null`
 * simplesmente não aparece. Preencha aqui (e só aqui) quando os dados forem
 * confirmados, por exemplo `phone: '+33 1 23 45 67 89'` ou
 * `instagram: 'aromasdavivi'` (sem @).
 */
export interface RestaurantContact {
  address: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
}

export const RESTAURANT_CONTACT: RestaurantContact = {
  address: null,
  phone: null,
  email: null,
  instagram: null,
};

export const hasContact = (contact: RestaurantContact = RESTAURANT_CONTACT) =>
  Boolean(contact.address || contact.phone || contact.email || contact.instagram);
