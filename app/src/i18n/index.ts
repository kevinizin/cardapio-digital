import { adminCore } from './pt-BR/adminCore';
import { adminPages } from './pt-BR/adminPages';
import { common } from './pt-BR/common';
import { publicMessages } from './pt-BR/public';
import { remote } from './pt-BR/remote';

/**
 * Textos da interface em português do Brasil, reunidos num só lugar. `t` é
 * estático e serve à administração (sempre em português). O site público usa
 * `useT()` / `useI18n()`, que seguem o idioma escolhido (fr, pt ou en), com a
 * mesma forma de `t` sem a parte `admin`.
 */
export const t = { ...common, remote, public: publicMessages, admin: { ...adminCore, ...adminPages } };
export type Messages = typeof t;

export { conflictMessage, errorMessage, warningMessage } from './pt-BR/errors';
export * from './format';
export * from './locale';
export { getBundle, PUBLIC_MESSAGES, type I18nBundle, type PublicMessages } from './dictionaries';
export { isAdminPath, LocaleProvider, useI18n, useT } from './LocaleProvider';
