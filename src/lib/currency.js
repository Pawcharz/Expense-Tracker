// FX rates are fetched from Frankfurter (ECB data, EUR base, no API key).
// Cached in localStorage for 12h so the UI is offline-friendly between days.

const CACHE_KEY = 'fx_rates_eur_v1';
const TTL_MS = 12 * 60 * 60 * 1000;

// Fallback used only if the very first fetch fails and nothing is cached yet.
// Rough mid-2024 numbers — good enough to render something instead of NaN.
const FALLBACK_EUR_RATES = {
  EUR: 1, PLN: 4.30, USD: 1.08, GBP: 0.85, CHF: 0.95, CZK: 25.0,
  SEK: 11.3, NOK: 11.5, DKK: 7.46, HUF: 395, JPY: 160, CAD: 1.46,
  AUD: 1.63, NZD: 1.75, CNY: 7.85, BGN: 1.96, RON: 4.97, TRY: 35.0,
  UAH: 44.0,
};

// Supported display + entry currencies. Order = picker order.
export const SUPPORTED_CURRENCIES = [
  'PLN', 'EUR', 'USD', 'GBP', 'CHF', 'CZK',
  'SEK', 'NOK', 'DKK', 'HUF', 'RON', 'BGN',
  'JPY', 'CNY', 'CAD', 'AUD', 'NZD', 'TRY', 'UAH',
];

export const CURRENCY_LABELS = {
  PLN: 'Polish Złoty', EUR: 'Euro', USD: 'US Dollar', GBP: 'British Pound',
  CHF: 'Swiss Franc', CZK: 'Czech Koruna', SEK: 'Swedish Krona',
  NOK: 'Norwegian Krone', DKK: 'Danish Krone', HUF: 'Hungarian Forint',
  RON: 'Romanian Leu', BGN: 'Bulgarian Lev', JPY: 'Japanese Yen',
  CNY: 'Chinese Yuan', CAD: 'Canadian Dollar', AUD: 'Australian Dollar',
  NZD: 'New Zealand Dollar', TRY: 'Turkish Lira', UAH: 'Ukrainian Hryvnia',
};

let inflightPromise = null;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(rates) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), r: rates }));
  } catch {}
}

export async function loadRates() {
  const cached = readCache();
  if (cached && Date.now() - cached.t < TTL_MS) return cached.r;

  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    try {
      const res = await fetch('https://api.frankfurter.app/latest?from=EUR');
      if (!res.ok) throw new Error('fx fetch failed');
      const data = await res.json();
      const rates = { ...data.rates, EUR: 1 };
      writeCache(rates);
      return rates;
    } catch {
      return cached?.r || FALLBACK_EUR_RATES;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

// 1 unit of `from` is worth `getRate(...)` units of `to`.
// `rates` is the EUR-base table (1 EUR = rates[X] X).
export function getRate(from, to, rates) {
  if (!from || !to || from === to) return 1;
  if (!rates) return 1;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return 1;
  return toRate / fromRate;
}

export function convert(amount, from, to, rates) {
  if (amount == null || isNaN(amount)) return amount;
  return amount * getRate(from, to, rates);
}

export function formatAmount(amount, currency) {
  if (amount == null || isNaN(amount)) return '—';
  return `${Number(amount).toFixed(2)} ${currency}`;
}
