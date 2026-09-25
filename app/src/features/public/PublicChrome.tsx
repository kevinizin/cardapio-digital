import { AtSign, Mail, MapPin, Phone } from 'lucide-react';
import { hasContact, RESTAURANT_CONTACT, type RestaurantContact } from '../../config/restaurant';
import { LOCALE_NAMES, LOCALES, useI18n, useT } from '../../i18n';

const LOCALE_CODES = { fr: 'FR', pt: 'PT', en: 'EN' } as const;

/** Seletor de idioma do site público (FR · PT · EN). */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { publicLocale, setLocale, t } = useI18n();
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={t.public.nav.language}>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale === 'pt' ? 'pt-BR' : locale === 'en' ? 'en-GB' : 'fr'}
          className="lang-switch__btn"
          aria-pressed={publicLocale === locale}
          aria-label={LOCALE_NAMES[locale]}
          title={LOCALE_NAMES[locale]}
          onClick={() => setLocale(locale)}
        >
          {LOCALE_CODES[locale]}
        </button>
      ))}
    </div>
  );
}

/** Contatos do restaurante; só mostra os campos preenchidos (nada, se nenhum). */
export function ContactList({ contact = RESTAURANT_CONTACT, className = '' }: { contact?: RestaurantContact; className?: string }) {
  const t = useT();
  const c = t.public.contact;
  if (!hasContact(contact)) return null;
  const instagram = contact.instagram?.replace(/^@/, '');
  return (
    <ul className={`pub-contact ${className}`} aria-label={c.label}>
      {contact.address && (
        <li>
          <MapPin aria-hidden="true" />
          <span className="visually-hidden">{c.address}: </span>
          {contact.address}
        </li>
      )}
      {contact.phone && (
        <li>
          <Phone aria-hidden="true" />
          <span className="visually-hidden">{c.phone}: </span>
          <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>{contact.phone}</a>
        </li>
      )}
      {contact.email && (
        <li>
          <Mail aria-hidden="true" />
          <span className="visually-hidden">{c.email}: </span>
          <a href={`mailto:${contact.email}`}>{contact.email}</a>
        </li>
      )}
      {instagram && (
        <li>
          <AtSign aria-hidden="true" />
          <span className="visually-hidden">{c.instagram}: </span>
          <a href={`https://www.instagram.com/${encodeURIComponent(instagram)}/`} target="_blank" rel="noopener noreferrer">
            @{instagram}
          </a>
        </li>
      )}
    </ul>
  );
}
