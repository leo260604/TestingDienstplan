/* CSV-Erzeugung (Semikolon, UTF-8 mit BOM – öffnet sich direkt in Excel) */
import type { Cell } from './formats';

/** Zellen, die Excel als Formel ausführen würde (=, @, +/- mit Text), bekommen ein ' vorangestellt.
    Telefonnummern wie +43 … bleiben unverändert. */
export function csvSafe(v: unknown): string {
  const s = String(v ?? '');
  return /^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && /[^0-9\s.,:/()+-]/.test(s)) ? "'" + s : s;
}

export function toCsv(rows: Cell[][], decimalComma = true): string {
  return (
    '﻿' +
    rows
      .map((line) =>
        line.map((v) => '"' + csvSafe(typeof v === 'number' && decimalComma ? String(v).replace('.', ',') : v).replace(/"/g, '""') + '"').join(';'),
      )
      .join('\r\n')
  );
}

export function safeFileName(name: string): string {
  return (name || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, '-')
    .replace(/^-|-$/g, '');
}

/** Datei im Browser speichern */
export function saveFile(filename: string, data: string | Blob, mime = 'application/octet-stream'): number {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  return blob.size;
}

export const downloadCsv = (rows: Cell[][], fileName: string) => saveFile(fileName, toCsv(rows), 'text/csv;charset=utf-8;');
