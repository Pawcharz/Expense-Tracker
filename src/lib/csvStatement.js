// Parser for bank CSV exports (Erste / Santander-style layout).
//
// Sample export:
//   2026-09-29,01-07-2026,'25 1090 2835 0000 0001 4302 9481,PAWEŁ ...,PLN,"23121,55","35306,26",178,
//   <booking date>,<operation date>,<title>,<counterparty>,<counterparty account>,"<amount>","<balance after>",<no>,
//
// The first row is an account summary (export date, period start, account,
// owner, currency, opening balance, closing balance, transaction count) and is
// skipped. Every following row is one transaction. Column positions are
// detected heuristically so minor layout differences between banks still work.

const DATE_RE = /^(\d{4})[-./](\d{2})[-./](\d{2})$|^(\d{2})[-./](\d{2})[-./](\d{4})$/;
const NUMBER_RE = /^[-+]?\d{1,3}([  ]?\d{3})*([.,]\d{1,2})?$|^[-+]?\d+([.,]\d{1,2})?$/;
const IBAN_RE = /^'?\s*(?:[A-Z]{2})?\s*\d{2}(?:\s?\d{4}){6}\s*$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find(l => l.trim()) || '';
  const counts = [',', ';', '\t'].map(d => ({ d, n: firstLine.split(d).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 1 ? counts[0].d : ',';
}

// RFC 4180-ish parser: handles quoted fields, escaped quotes, CRLF.
export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some(f => f.trim() !== '')) rows.push(row);
  return rows;
}

export function parseDate(str) {
  const m = (str || '').trim().match(DATE_RE);
  if (!m) return null;
  const [y, mo, d] = m[1] ? [m[1], m[2], m[3]] : [m[6], m[5], m[4]];
  const date = new Date(`${y}-${mo}-${d}T12:00`);
  return isNaN(date.getTime()) ? null : `${y}-${mo}-${d}T12:00`;
}

export function parseAmount(str) {
  const clean = (str || '').replace(/[  ]/g, '').replace(',', '.');
  if (!NUMBER_RE.test((str || '').trim())) return null;
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function isDate(f) { return DATE_RE.test((f || '').trim()); }
function isNumber(f) { return NUMBER_RE.test((f || '').trim()); }
function isIban(f) { return IBAN_RE.test((f || '').trim()); }
function isCurrency(f) { return CURRENCY_RE.test((f || '').trim()); }

// The summary line carries a currency code and an IBAN and no transaction title.
function isSummaryRow(fields) {
  return fields.some(isCurrency) && fields.some(isIban) && fields.filter(isDate).length >= 1 && fields.filter(isNumber).length >= 2;
}

function isHeaderRow(fields) {
  return !fields.some(isDate) && !fields.some(isNumber);
}

/**
 * Parse a bank CSV export into plain transaction objects:
 *   { date, booking_date, raw_description, amount, is_expense, currency }
 * Returns { currency, transactions }.
 */
export function parseBankCsv(text) {
  const rows = parseCsv(text);
  let currency = null;
  const transactions = [];

  for (const fields of rows) {
    const trimmed = fields.map(f => (f || '').trim());
    if (trimmed.every(f => f === '')) continue;

    if (isSummaryRow(trimmed)) {
      currency = trimmed.find(isCurrency) || currency;
      continue;
    }
    if (isHeaderRow(trimmed)) continue;

    const dateCols = trimmed.filter(isDate);
    if (dateCols.length === 0) continue;
    const bookingDate = parseDate(dateCols[0]);
    const operationDate = parseDate(dateCols[1] || dateCols[0]);

    // Numeric columns that are not dates or the ordinal: first = amount, second = balance.
    const numericCols = trimmed.filter(f => isNumber(f) && !isDate(f));
    // Drop a trailing integer ordinal (transaction number) if present.
    const decimals = numericCols.filter(f => /[.,]\d{1,2}$/.test(f));
    const amountStr = decimals[0] ?? numericCols[0];
    const amount = parseAmount(amountStr);
    if (amount == null) continue;

    const rowCurrency = trimmed.find(isCurrency) || null;

    const textCols = trimmed.filter(f =>
      f !== '' && !isDate(f) && !isNumber(f) && !isIban(f) && !isCurrency(f)
    );
    const raw_description = textCols.join(' | ');
    if (!raw_description) continue;

    transactions.push({
      date: operationDate || bookingDate,
      booking_date: bookingDate,
      raw_description,
      amount: Math.abs(amount),
      is_expense: amount < 0,
      currency: rowCurrency || currency,
    });
  }

  return { currency, transactions };
}
