export const CSV_SEPARATOR = ';';
/** BOM para planilhas reconhecerem UTF-8 (acentos). */
export const CSV_BOM = String.fromCharCode(0xfeff);

type CsvValue = string | number | null | undefined;

/**
 * Escapa um campo de CSV. Textos que começam com =, +, -, @, tabulação ou
 * retorno de carro recebem apóstrofo para não serem executados como fórmula
 * em planilhas (injeção de fórmulas).
 */
export function escapeCsvField(value: CsvValue, separator = CSV_SEPARATOR): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value;
  if (typeof value === 'string' && /^\s*[=+\-@]|^[\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (text.includes('"') || text.includes(separator) || /[\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: readonly (readonly CsvValue[])[], separator = CSV_SEPARATOR): string {
  return rows.map((row) => row.map((field) => escapeCsvField(field, separator)).join(separator)).join('\r\n');
}
