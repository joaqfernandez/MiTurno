/** Exportación a CSV para abrir en Excel (configuración regional argentina) o importar en Power BI. */

export type CsvValue = string | number | null | undefined;

function cell(value: CsvValue): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Un texto que empieza con = + - @ se ejecutaría como fórmula al abrir el archivo: se neutraliza con un apóstrofo.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Separador «;» porque Excel en español usa la coma para los decimales. */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]) {
  // BOM: sin él Excel muestra mal los acentos.
  const url = URL.createObjectURL(new Blob(['﻿', toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
