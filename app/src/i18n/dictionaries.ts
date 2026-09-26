import { common as enCommon } from './en/common';
import { errorMessage as enError, warningMessage as enWarning } from './en/errors';
import { publicMessages as enPublic } from './en/public';
import { remote as enRemote } from './en/remote';
import { createFormatters, type Formatters } from './format';
import { common as frCommon } from './fr/common';
import { errorMessage as frError, warningMessage as frWarning } from './fr/errors';
import { publicMessages as frPublic } from './fr/public';
import { remote as frRemote } from './fr/remote';
import type { Locale } from './locale';
import { common as ptCommon } from './pt-BR/common';
import { errorMessage as ptError, warningMessage as ptWarning } from './pt-BR/errors';
import { publicMessages as ptPublic } from './pt-BR/public';
import { remote as ptRemote } from './pt-BR/remote';

/** Textos do site público num idioma: a mesma forma de `t`, sem a administração. */
const ptMessages = { ...ptCommon, remote: ptRemote, public: ptPublic };
export type PublicMessages = typeof ptMessages;

export const PUBLIC_MESSAGES: Record<Locale, PublicMessages> = {
  pt: ptMessages,
  fr: { ...frCommon, remote: frRemote, public: frPublic } satisfies PublicMessages,
  en: { ...enCommon, remote: enRemote, public: enPublic } satisfies PublicMessages,
};

export interface I18nBundle {
  locale: Locale;
  t: PublicMessages;
  f: Formatters;
  errorMessage: typeof ptError;
  warningMessage: typeof ptWarning;
}

const ERRORS: Record<Locale, Pick<I18nBundle, 'errorMessage' | 'warningMessage'>> = {
  pt: { errorMessage: ptError, warningMessage: ptWarning },
  fr: { errorMessage: frError, warningMessage: frWarning },
  en: { errorMessage: enError, warningMessage: enWarning },
};

const bundles = new Map<Locale, I18nBundle>();

export function getBundle(locale: Locale): I18nBundle {
  let bundle = bundles.get(locale);
  if (!bundle) {
    bundle = { locale, t: PUBLIC_MESSAGES[locale], f: createFormatters(locale), ...ERRORS[locale] };
    bundles.set(locale, bundle);
  }
  return bundle;
}
