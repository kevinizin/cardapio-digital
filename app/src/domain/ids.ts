/** Fonte de aleatoriedade no intervalo [0, 1). */
export type RandomSource = () => number;

/** Aleatoriedade criptográfica do navegador/Node para códigos públicos. */
export function cryptoRandom(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] / 2 ** 32;
}

/** Gerador determinístico (mulberry32) usado apenas nos dados fictícios. */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sem 0/O e 1/I para evitar confusão na leitura. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChars(length: number, random: RandomSource): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}

/** Código público aleatório e não sequencial, no formato XXXX-XXXX. */
export function generateReservationCode(existing: ReadonlySet<string>, random: RandomSource = cryptoRandom): string {
  for (;;) {
    const code = `${randomChars(4, random)}-${randomChars(4, random)}`;
    if (!existing.has(code)) return code;
  }
}

/** Aceita o código com ou sem hífen, espaços ou letras minúsculas. */
export function normalizeCode(input: string): string {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}

export function generateId(prefix: string, random: RandomSource = cryptoRandom): string {
  return `${prefix}_${randomChars(12, random).toLowerCase()}`;
}
