import { adminCore } from './pt-BR/adminCore';
import { adminPages } from './pt-BR/adminPages';
import { common } from './pt-BR/common';
import { publicMessages } from './pt-BR/public';
import { remote } from './pt-BR/remote';

/**
 * Textos da interface em português do Brasil, reunidos num só lugar. Para
 * traduzir, crie módulos com a mesma forma (tipo Messages) e troque `t`.
 */
export const t = { ...common, remote, public: publicMessages, admin: { ...adminCore, ...adminPages } };
export type Messages = typeof t;

export { conflictMessage, errorMessage, warningMessage } from './pt-BR/errors';
export * from './format';
