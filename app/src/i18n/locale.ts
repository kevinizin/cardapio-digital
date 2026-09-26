/** Idiomas do site público. A administração é sempre em português. */
export type Locale = 'fr' | 'pt' | 'en';

export const LOCALES: readonly Locale[] = ['fr', 'pt', 'en'];
export const DEFAULT_LOCALE: Locale = 'fr';
/** Idioma fixo da administração. */
export const ADMIN_LOCALE: Locale = 'pt';

/** Locale do Intl/luxon para cada idioma. */
export const INTL_LOCALE: Record<Locale, string> = { fr: 'fr-FR', pt: 'pt-BR', en: 'en-GB' };
/** Valor de `<html lang>`. */
export const HTML_LANG: Record<Locale, string> = { fr: 'fr', pt: 'pt-BR', en: 'en-GB' };
/** Nome de cada idioma nele mesmo (seletor de idioma). */
export const LOCALE_NAMES: Record<Locale, string> = { fr: 'Français', pt: 'Português', en: 'English' };

export const LOCALE_STORAGE_KEY = 'aromas-da-vivi:locale';

export const isLocale = (value: unknown): value is Locale => typeof value === 'string' && (LOCALES as string[]).includes(value);

/**
 * Escolha inicial: a preferência salva, se válida; senão português ou inglês
 * quando o navegador estiver nesses idiomas; senão francês.
 */
export function detectLocale(stored: string | null | undefined, browserLanguage: string | null | undefined): Locale {
  if (isLocale(stored)) return stored;
  const language = (browserLanguage ?? '').toLowerCase();
  if (language.startsWith('pt')) return 'pt';
  if (language.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function readStoredLocale(storage: StorageLike | null = defaultStorage()): string | null {
  try {
    return storage?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Salva a escolha; falhas do armazenamento (modo privado, cota) são ignoradas. */
export function storeLocale(locale: Locale, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Sem armazenamento: a escolha vale só nesta visita.
  }
}

export function initialLocale(storage: StorageLike | null = defaultStorage()): Locale {
  const browser = typeof navigator === 'undefined' ? null : navigator.language;
  return detectLocale(readStoredLocale(storage), browser);
}
