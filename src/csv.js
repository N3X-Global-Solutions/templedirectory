const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const BOM = '﻿';

/** Neutralises spreadsheet formula injection and applies RFC 4180 quoting. */
export function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** columns: [{ header, value: (row) => any }]. BOM makes Excel read Tamil text as UTF-8. */
export function toCsv(columns, rows) {
  const lines = [
    columns.map((column) => csvCell(column.header)).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(',')),
  ];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

export function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

export const oneLine = (text) => String(text ?? '').replace(/\s*\n\s*/g, ', ');
export const rupees = (paise) => (Number(paise ?? 0) / 100).toFixed(2);
