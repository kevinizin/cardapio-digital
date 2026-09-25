import type { CustomerLocale } from '../../src/domain/types';

/** Textos dos e-mails ao cliente, nos três idiomas do site público. */

export type EmailKind = 'confirm' | 'change' | 'cancel' | 'reminder';

export interface EmailCopy {
  htmlLang: string;
  subject: Record<EmailKind, (when: string) => string>;
  preheader: Record<EmailKind, (when: string) => string>;
  heading: Record<EmailKind, string>;
  greeting: (name: string) => string;
  lead: {
    confirm: string;
    change: string;
    cancelCustomer: string;
    cancelAdmin: string;
    reminder: string;
  };
  labels: { code: string; date: string; time: string; guests: string; address: string };
  people: (n: number) => string;
  timeValue: (time: string) => string;
  directions: string;
  manageButton: string;
  manageHint: string;
  cancelDeadline: (duration: string) => string;
  bookAgainButton: string;
  bookAgainText: string;
  whatsappText: string;
  whatsappTextCancel: string;
  signOff: string;
  team: string;
  footer: string;
}

const nb = ' ';

const fr: EmailCopy = {
  htmlLang: 'fr',
  subject: {
    confirm: (when) => `Réservation confirmée · ${when}`,
    change: (when) => `Réservation modifiée · ${when}`,
    cancel: (when) => `Réservation annulée · ${when}`,
    reminder: (when) => `À demain${nb}! Votre table · ${when}`,
  },
  preheader: {
    confirm: (when) => `Votre table vous attend ${when}.`,
    change: (when) => `Nouvelles informations${nb}: ${when}.`,
    cancel: (when) => `La réservation du ${when} est annulée.`,
    reminder: (when) => `Rappel${nb}: nous vous attendons ${when}.`,
  },
  heading: {
    confirm: 'Votre table est réservée',
    change: 'Votre réservation a changé',
    cancel: 'Réservation annulée',
    reminder: 'À demain, avec plaisir',
  },
  greeting: (name) => `Bonjour ${name},`,
  lead: {
    confirm: 'Merci pour votre réservation chez Aromas da Vivi. Nous avons hâte de vous accueillir pour un moment de cuisine brésilienne faite avec amour.',
    change: 'Votre réservation a été mise à jour. Voici les nouvelles informations.',
    cancelCustomer: 'Comme vous l’avez demandé, votre réservation a bien été annulée. Nous espérons vous accueillir une prochaine fois.',
    cancelAdmin: `Nous sommes désolés${nb}: nous avons dû annuler votre réservation. N’hésitez pas à nous écrire pour trouver un autre moment.`,
    reminder: `Petit rappel${nb}: nous vous attendons demain. Toute l’équipe se réjouit de vous recevoir.`,
  },
  labels: { code: 'Code de réservation', date: 'Date', time: 'Heure', guests: 'Personnes', address: 'Adresse' },
  people: (n) => (n === 1 ? '1 personne' : `${n} personnes`),
  timeValue: (time) => `${time} (heure de Paris)`,
  directions: 'Voir l’itinéraire',
  manageButton: 'Consulter ou annuler',
  manageHint: 'Munissez-vous du code ci-dessus et de votre e-mail.',
  cancelDeadline: (duration) => `Annulation en ligne possible jusqu’à ${duration} avant l’heure réservée.`,
  bookAgainButton: 'Réserver une table',
  bookAgainText: `Envie de venir à une autre date${nb}?`,
  whatsappText: `Une question, un retard, une occasion spéciale${nb}? Écrivez-nous sur WhatsApp${nb}:`,
  whatsappTextCancel: `Une question${nb}? Écrivez-nous sur WhatsApp${nb}:`,
  signOff: 'À très bientôt,',
  team: 'L’équipe Aromas da Vivi',
  footer: 'Vous recevez cet e-mail parce qu’une réservation a été faite avec cette adresse chez Aromas da Vivi.',
};

const pt: EmailCopy = {
  htmlLang: 'pt-BR',
  subject: {
    confirm: (when) => `Reserva confirmada · ${when}`,
    change: (when) => `Reserva alterada · ${when}`,
    cancel: (when) => `Reserva cancelada · ${when}`,
    reminder: (when) => `Até amanhã! Sua mesa · ${when}`,
  },
  preheader: {
    confirm: (when) => `Sua mesa espera por você ${when}.`,
    change: (when) => `Novos dados da reserva: ${when}.`,
    cancel: (when) => `A reserva de ${when} foi cancelada.`,
    reminder: (when) => `Lembrete: esperamos você ${when}.`,
  },
  heading: {
    confirm: 'Sua mesa está reservada',
    change: 'Sua reserva mudou',
    cancel: 'Reserva cancelada',
    reminder: 'Até amanhã, com carinho',
  },
  greeting: (name) => `Olá, ${name}!`,
  lead: {
    confirm: 'Obrigada por reservar no Aromas da Vivi. Estamos ansiosos para receber você com o sabor da cozinha brasileira feita com carinho.',
    change: 'Sua reserva foi atualizada. Confira os novos dados abaixo.',
    cancelCustomer: 'Como você pediu, sua reserva foi cancelada. Esperamos receber você numa próxima vez.',
    cancelAdmin: 'Sentimos muito: precisamos cancelar a sua reserva. Fale com a gente para encontrarmos outro horário.',
    reminder: 'Passando para lembrar: esperamos você amanhã. Toda a equipe está animada para receber você.',
  },
  labels: { code: 'Código da reserva', date: 'Data', time: 'Horário', guests: 'Pessoas', address: 'Endereço' },
  people: (n) => (n === 1 ? '1 pessoa' : `${n} pessoas`),
  timeValue: (time) => `${time} (horário de Paris)`,
  directions: 'Ver no mapa',
  manageButton: 'Consultar ou cancelar',
  manageHint: 'Tenha em mãos o código acima e o seu e-mail.',
  cancelDeadline: (duration) => `Cancelamento online possível até ${duration} antes do horário reservado.`,
  bookAgainButton: 'Reservar uma mesa',
  bookAgainText: 'Quer vir em outra data?',
  whatsappText: 'Alguma dúvida, atraso ou ocasião especial? Fale com a gente pelo WhatsApp:',
  whatsappTextCancel: 'Alguma dúvida? Fale com a gente pelo WhatsApp:',
  signOff: 'Até breve,',
  team: 'Equipe Aromas da Vivi',
  footer: 'Você recebeu este e-mail porque uma reserva foi feita com este endereço no Aromas da Vivi.',
};

const en: EmailCopy = {
  htmlLang: 'en-GB',
  subject: {
    confirm: (when) => `Booking confirmed · ${when}`,
    change: (when) => `Booking updated · ${when}`,
    cancel: (when) => `Booking cancelled · ${when}`,
    reminder: (when) => `See you tomorrow! Your table · ${when}`,
  },
  preheader: {
    confirm: (when) => `Your table is waiting for you on ${when}.`,
    change: (when) => `New booking details: ${when}.`,
    cancel: (when) => `Your booking for ${when} has been cancelled.`,
    reminder: (when) => `Reminder: we look forward to seeing you ${when}.`,
  },
  heading: {
    confirm: 'Your table is booked',
    change: 'Your booking has changed',
    cancel: 'Booking cancelled',
    reminder: 'See you tomorrow',
  },
  greeting: (name) => `Hello ${name},`,
  lead: {
    confirm: 'Thank you for booking at Aromas da Vivi. We can’t wait to welcome you for Brazilian home cooking made with love.',
    change: 'Your booking has been updated. Here are the new details.',
    cancelCustomer: 'As requested, your booking has been cancelled. We hope to welcome you another time.',
    cancelAdmin: 'We’re sorry: we had to cancel your booking. Please get in touch and we’ll find another time for you.',
    reminder: 'Just a friendly reminder: we’re expecting you tomorrow. The whole team is looking forward to it.',
  },
  labels: { code: 'Booking code', date: 'Date', time: 'Time', guests: 'Guests', address: 'Address' },
  people: (n) => (n === 1 ? '1 guest' : `${n} guests`),
  timeValue: (time) => `${time} (Paris time)`,
  directions: 'Get directions',
  manageButton: 'View or cancel',
  manageHint: 'You’ll need the code above and your email address.',
  cancelDeadline: (duration) => `Online cancellation is possible up to ${duration} before your booking.`,
  bookAgainButton: 'Book a table',
  bookAgainText: 'Would you like to come on another date?',
  whatsappText: 'A question, running late or a special occasion? Message us on WhatsApp:',
  whatsappTextCancel: 'Any questions? Message us on WhatsApp:',
  signOff: 'See you soon,',
  team: 'The Aromas da Vivi team',
  footer: 'You are receiving this email because a booking was made with this address at Aromas da Vivi.',
};

export const EMAIL_COPY: Record<CustomerLocale, EmailCopy> = { fr, pt, en };
