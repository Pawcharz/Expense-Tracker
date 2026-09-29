import { supabase } from './supabase';

const AMOUNT_TOLERANCE = 0.01;
const DAY_MS = 24 * 60 * 60 * 1000;

function localDayKey(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Fetch the user's existing receipts that could collide with the given
 * transactions (same date window, padded by 2 days on each side so that bank
 * posting delays are covered).
 */
export async function fetchExistingReceiptsAround(userId, transactions) {
  const dates = transactions
    .map(tx => (tx.date ? new Date(tx.date) : null))
    .filter(d => d && !isNaN(d.getTime()));
  if (dates.length === 0) return [];

  const min = new Date(Math.min(...dates.map(d => d.getTime())) - 2 * DAY_MS);
  const max = new Date(Math.max(...dates.map(d => d.getTime())) + 2 * DAY_MS);

  const { data, error } = await supabase
    .from('receipts')
    .select('id, store, date, total, currency')
    .eq('user_id', userId)
    .gte('date', min.toISOString())
    .lte('date', max.toISOString());

  if (error) throw error;
  return data || [];
}

/**
 * Find an existing receipt matching a transaction.
 * Returns { receipt, level } where level is:
 *   'exact' — same amount (±0.01), same currency, same calendar day
 *   'near'  — same amount, same currency, within ±2 days (bank posting lag)
 * or null when nothing matches.
 */
export function findDuplicate(tx, existing) {
  if (!tx.date || tx.amount == null) return null;
  const txDate = new Date(tx.date);
  if (isNaN(txDate.getTime())) return null;
  const txDay = localDayKey(txDate);

  let near = null;
  for (const r of existing) {
    const total = parseFloat(r.total);
    if (isNaN(total) || Math.abs(total - tx.amount) > AMOUNT_TOLERANCE) continue;
    if (tx.currency && r.currency && tx.currency !== r.currency) continue;

    const rDate = new Date(r.date);
    if (localDayKey(rDate) === txDay) return { receipt: r, level: 'exact' };
    if (!near && Math.abs(rDate.getTime() - txDate.getTime()) <= 2 * DAY_MS) {
      near = { receipt: r, level: 'near' };
    }
  }
  return near;
}
