import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { getBundle, type I18nBundle } from './dictionaries';
import { ADMIN_LOCALE, HTML_LANG, initialLocale, storeLocale, type Locale } from './locale';

interface LocaleContextValue extends I18nBundle {
  /** Idioma escolhido para o site público (a administração ignora e usa português). */
  publicLocale: Locale;
  setLocale: (locale: Locale) => void;
}

const noop = () => {};

// Sem provedor (ex.: testes, telas fora do roteador): português.
const LocaleContext = createContext<LocaleContextValue>({ ...getBundle(ADMIN_LOCALE), publicLocale: ADMIN_LOCALE, setLocale: noop });

export const isAdminPath = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/');

/**
 * Idioma da interface. No site público vale a escolha do visitante (salva no
 * navegador); em /admin é sempre português. Também atualiza `<html lang>`.
 * Precisa estar dentro do roteador.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [publicLocale, setPublicLocale] = useState<Locale>(() => initialLocale());
  const admin = isAdminPath(pathname);
  const locale = admin ? ADMIN_LOCALE : publicLocale;

  const setLocale = useCallback((next: Locale) => {
    setPublicLocale(next);
    storeLocale(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
  }, [locale]);

  const value = useMemo(() => ({ ...getBundle(locale), publicLocale, setLocale }), [locale, publicLocale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Idioma ativo, textos (`t`), formatação (`f`) e mensagens de erro. */
export function useI18n(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** Atalho para os textos do idioma ativo (mesma forma de `t`, sem a administração). */
export function useT() {
  return useContext(LocaleContext).t;
}
