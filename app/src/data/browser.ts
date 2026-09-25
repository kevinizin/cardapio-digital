import { STORAGE_PREFIX } from './repository';

/** Utilidades de navegador com tolerância a armazenamento indisponível. */

const RECENT_CODES_KEY = `${STORAGE_PREFIX}recent-codes`;
const BOOKING_DRAFT_KEY = `${STORAGE_PREFIX}booking-draft`;
const memoryCodes = new Set<string>();

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readCodes(): string[] {
  try {
    const raw = local()?.getItem(RECENT_CODES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Códigos criados neste navegador: permitem reabrir a confirmação sem pedir o e-mail. */
export function rememberReservationCode(code: string): void {
  memoryCodes.add(code);
  try {
    const next = [code, ...readCodes().filter((c) => c !== code)].slice(0, 20);
    local()?.setItem(RECENT_CODES_KEY, JSON.stringify(next));
  } catch {
    // Mantido apenas em memória.
  }
}

export function isRecentReservationCode(code: string): boolean {
  return memoryCodes.has(code) || readCodes().includes(code);
}

export function saveBookingDraft(draft: unknown): void {
  try {
    session()?.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Rascunho é conveniência: falhar em silêncio não perde dados salvos.
  }
}

export function loadBookingDraft(): unknown {
  try {
    const raw = session()?.getItem(BOOKING_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function clearBookingDraft(): void {
  try {
    session()?.removeItem(BOOKING_DRAFT_KEY);
  } catch {
    // Nada a limpar.
  }
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Tenta o método alternativo abaixo.
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}
