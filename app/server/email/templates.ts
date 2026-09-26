import { DateTime } from 'luxon';
import { formatWhatsapp, RESTAURANT_CONTACT, whatsappUrl, type RestaurantContact } from '../../src/config/restaurant';
import { RESTAURANT_ZONE, toMs } from '../../src/domain/time';
import type { CustomerLocale, Reservation } from '../../src/domain/types';
import { createFormatters } from '../../src/i18n/format';
import { INTL_LOCALE } from '../../src/i18n/locale';
import { EMAIL_COPY, type EmailKind } from './messages';

/**
 * E-mails ao cliente: HTML em tabelas com estilos inline (compatível com os
 * principais leitores, sem fontes externas) + versão em texto simples.
 */

export interface RenderContext {
  publicUrl: string;
  customerCancelMinutes: number;
  contact?: RestaurantContact;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = {
  burgundy: '#841731',
  burgundyDark: '#5e0f22',
  gold: '#c9a24a',
  goldText: '#7a5c1c',
  cream: '#f8f3ea',
  blush: '#f3e2e3',
  charcoal: '#2a2224',
  muted: '#6b5d60',
  line: '#eadfd0',
};

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const localeOf = (reservation: Reservation): CustomerLocale => reservation.locale ?? 'fr';

export function manageUrl(publicUrl: string, reservation: Reservation): string {
  const params = new URLSearchParams({ codigo: reservation.code });
  if (reservation.customer.email) params.set('email', reservation.customer.email);
  return `${publicUrl}/consultar?${params.toString()}`;
}

/** "mardi 15 septembre à 19:30" · "terça-feira, 15 de setembro, às 19:30" · "Tuesday 15 September at 19:30". */
export function formatWhen(ms: number, locale: CustomerLocale): string {
  const pattern = { fr: "cccc d LLLL 'à' HH:mm", pt: "cccc, d 'de' LLLL, 'às' HH:mm", en: "cccc d LLLL 'at' HH:mm" }[locale];
  return DateTime.fromMillis(ms, { zone: RESTAURANT_ZONE }).setLocale(INTL_LOCALE[locale]).toFormat(pattern);
}

function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first.length >= 2 ? first : name.trim();
}

export function renderEmail(kind: EmailKind, reservation: Reservation, context: RenderContext): RenderedEmail {
  const locale = localeOf(reservation);
  const copy = EMAIL_COPY[locale];
  const f = createFormatters(locale);
  const contact = context.contact ?? RESTAURANT_CONTACT;
  const start = toMs(reservation.startAt);
  const when = formatWhen(start, locale);
  const dateLong = f.capitalize(f.formatLocalDateSpoken(DateTime.fromMillis(start, { zone: RESTAURANT_ZONE }).toISODate() ?? ''));
  const time = f.formatTime(start);
  const cancelled = kind === 'cancel';
  const lead =
    kind === 'cancel'
      ? reservation.cancelledBy === 'admin'
        ? copy.lead.cancelAdmin
        : copy.lead.cancelCustomer
      : copy.lead[kind];
  const manage = manageUrl(context.publicUrl, reservation);
  const bookUrl = `${context.publicUrl}/reservar`;
  const logoUrl = `${context.publicUrl}/brand/logo-aromas-da-vivi.jpg`;
  const deadline = copy.cancelDeadline(f.formatDuration(context.customerCancelMinutes));
  const whatsapp = contact.whatsapp ? { url: whatsappUrl(contact.whatsapp), label: formatWhatsapp(contact.whatsapp) } : null;
  const name = firstName(reservation.customer.name);
  const whatsappText = cancelled ? copy.whatsappTextCancel : copy.whatsappText;

  const subject = `${copy.subject[kind](when)} · Aromas da Vivi`;
  const e = escapeHtml;

  const detailRow = (label: string, value: string, extra = '', strike = cancelled) => `
              <tr>
                <td class="em-muted em-row" style="padding:10px 0;border-bottom:1px solid ${BRAND.line};font-family:${SANS};font-size:13px;line-height:18px;color:${BRAND.muted};width:38%;vertical-align:top;">${e(label)}</td>
                <td class="em-text em-row" style="padding:10px 0;border-bottom:1px solid ${BRAND.line};font-family:${SANS};font-size:15px;line-height:21px;color:${BRAND.charcoal};font-weight:600;vertical-align:top;${strike ? 'text-decoration:line-through;' : ''}">${value}${extra}</td>
              </tr>`;

  const addressValue = contact.address ? e(contact.address) : '';
  const directions =
    contact.address && contact.mapsUrl && !cancelled
      ? `<br><a class="em-link" href="${e(contact.mapsUrl)}" style="font-family:${SANS};font-size:13px;font-weight:400;color:${BRAND.burgundy};text-decoration:underline;">${e(copy.directions)}</a>`
      : '';

  const button = (href: string, label: string) => `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
            <tr>
              <td align="center" bgcolor="${BRAND.burgundy}" style="border-radius:999px;background-color:${BRAND.burgundy};">
                <a href="${e(href)}" class="em-button" style="display:inline-block;padding:14px 30px;font-family:${SANS};font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${e(label)}</a>
              </td>
            </tr>
          </table>`;

  const actionBlock = cancelled
    ? `
      <tr>
        <td class="em-card" style="padding:8px 32px 4px;background-color:#ffffff;text-align:center;">
          <p class="em-text" style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:22px;color:${BRAND.charcoal};">${e(copy.bookAgainText)}</p>
          ${button(bookUrl, copy.bookAgainButton)}
        </td>
      </tr>`
    : `
      <tr>
        <td class="em-card" style="padding:8px 32px 4px;background-color:#ffffff;text-align:center;">
          ${button(manage, copy.manageButton)}
          <p class="em-muted" style="margin:12px 0 0;font-family:${SANS};font-size:13px;line-height:19px;color:${BRAND.muted};">${e(copy.manageHint)}<br>${e(deadline)}</p>
        </td>
      </tr>`;

  const whatsappBlock = whatsapp
    ? `
      <tr>
        <td class="em-card" style="padding:22px 32px 0;background-color:#ffffff;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="em-soft" style="padding:14px 18px;background-color:${BRAND.blush};border-radius:12px;font-family:${SANS};font-size:14px;line-height:21px;color:${BRAND.charcoal};">
                ${e(whatsappText)}
                <a class="em-link" href="${e(whatsapp.url)}" style="color:${BRAND.burgundy};font-weight:700;text-decoration:underline;white-space:nowrap;">${e(whatsapp.label)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="${copy.htmlLang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${e(subject)}</title>
<style>
  body { margin:0; padding:0; }
  a { color:${BRAND.burgundy}; }
  @media (max-width: 480px) {
    .em-pad { padding-left:20px !important; padding-right:20px !important; }
    .em-card { padding-left:20px !important; padding-right:20px !important; }
    .em-title { font-size:26px !important; line-height:32px !important; }
    .em-code { font-size:24px !important; letter-spacing:4px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .em-bg { background-color:#1d1718 !important; }
    .em-card { background-color:#2a2224 !important; }
    .em-text { color:#f3ece6 !important; }
    .em-muted { color:#cbbcb6 !important; }
    .em-soft { background-color:#3a2a2e !important; color:#f3ece6 !important; }
    .em-codebox { background-color:#33282a !important; }
    .em-code { color:#e3c27a !important; }
    .em-footer { color:#a8999a !important; }
    .em-link { color:#e8b7c3 !important; }
    .em-row { border-color:#4a3b3e !important; }
  }
</style>
</head>
<body class="em-bg" style="margin:0;padding:0;background-color:${BRAND.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${e(copy.preheader[kind](when))}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" class="em-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cream}" style="background-color:${BRAND.cream};">
  <tr>
    <td align="center" class="em-pad" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border-collapse:separate;">
        <tr>
          <td align="center" bgcolor="${BRAND.burgundy}" style="background-color:${BRAND.burgundy};border-radius:18px 18px 0 0;padding:28px 24px 22px;">
            <img src="${e(logoUrl)}" width="84" height="84" alt="Aromas da Vivi" style="display:block;margin:0 auto;width:84px;height:84px;border-radius:50%;border:2px solid ${BRAND.gold};">
            <p style="margin:12px 0 0;font-family:${SERIF};font-size:13px;line-height:18px;letter-spacing:3px;text-transform:uppercase;color:${BRAND.gold};">Aromas da Vivi</p>
          </td>
        </tr>
        <tr>
          <td height="4" bgcolor="${BRAND.gold}" style="background-color:${BRAND.gold};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td class="em-card" style="padding:32px 32px 8px;background-color:#ffffff;">
            <h1 class="em-title em-text" style="margin:0 0 16px;font-family:${SERIF};font-size:30px;line-height:36px;font-weight:700;color:${BRAND.burgundy};">${e(copy.heading[kind])}</h1>
            <p class="em-text" style="margin:0 0 8px;font-family:${SANS};font-size:16px;line-height:24px;color:${BRAND.charcoal};">${e(copy.greeting(name))}</p>
            <p class="em-text" style="margin:0 0 20px;font-family:${SANS};font-size:16px;line-height:24px;color:${BRAND.charcoal};">${e(lead)}</p>
          </td>
        </tr>
        <tr>
          <td class="em-card" style="padding:0 32px;background-color:#ffffff;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="em-codebox" align="center" style="padding:14px 12px;background-color:${BRAND.cream};border:1px solid ${BRAND.gold};border-radius:12px;">
                  <p class="em-muted" style="margin:0 0 4px;font-family:${SANS};font-size:12px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:${BRAND.goldText};">${e(copy.labels.code)}</p>
                  <p class="em-code" style="margin:0;font-family:'Courier New', Courier, monospace;font-size:28px;line-height:34px;font-weight:700;letter-spacing:6px;color:${BRAND.burgundy};">${e(reservation.code)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="em-card" style="padding:16px 32px 20px;background-color:#ffffff;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRow(copy.labels.date, e(dateLong))}${detailRow(copy.labels.time, e(copy.timeValue(time)))}${detailRow(copy.labels.guests, e(copy.people(reservation.partySize)))}${addressValue && !cancelled ? detailRow(copy.labels.address, addressValue, directions, false) : ''}
            </table>
          </td>
        </tr>${actionBlock}${whatsappBlock}
        <tr>
          <td class="em-card" style="padding:24px 32px 30px;background-color:#ffffff;border-radius:0 0 18px 18px;">
            <p class="em-text" style="margin:0;font-family:${SANS};font-size:15px;line-height:22px;color:${BRAND.charcoal};">${e(copy.signOff)}<br><span class="em-link" style="font-family:${SERIF};font-size:17px;font-style:italic;color:${BRAND.burgundy};">${e(copy.team)}</span></p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:18px 16px 0;">
            <p class="em-footer" style="margin:0;font-family:${SANS};font-size:12px;line-height:18px;color:${BRAND.muted};">Aromas da Vivi${contact.address ? ` · ${e(contact.address)}` : ''}<br>${e(copy.footer)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const lines = [
    copy.heading[kind],
    '',
    copy.greeting(name),
    '',
    lead,
    '',
    `${copy.labels.code}: ${reservation.code}`,
    `${copy.labels.date}: ${dateLong}`,
    `${copy.labels.time}: ${copy.timeValue(time)}`,
    `${copy.labels.guests}: ${copy.people(reservation.partySize)}`,
    ...(contact.address && !cancelled ? [`${copy.labels.address}: ${contact.address}`] : []),
    ...(contact.mapsUrl && !cancelled ? [`${copy.directions}: ${contact.mapsUrl}`] : []),
    '',
    ...(cancelled
      ? [copy.bookAgainText, `${copy.bookAgainButton}: ${bookUrl}`]
      : [`${copy.manageButton}: ${manage}`, copy.manageHint, deadline]),
    ...(whatsapp ? ['', `${whatsappText} ${whatsapp.label} (${whatsapp.url})`] : []),
    '',
    copy.signOff,
    copy.team,
    '',
    '—',
    `Aromas da Vivi${contact.address ? ` · ${contact.address}` : ''}`,
    copy.footer,
  ];

  return { subject, html, text: lines.join('\n') };
}
