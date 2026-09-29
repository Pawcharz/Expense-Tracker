import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Pencil, X, List } from 'lucide-react';
import TransactionList from '../components/TransactionList';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useCurrency } from '../hooks/useCurrency';

export default function Analytics() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { displayCurrency, rateTo, ratesReady } = useCurrency();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [trendSpan, setTrendSpan] = useState(6);
  const [rawItems, setRawItems] = useState([]);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Last-30-days daily chart
  const [dailyItems, setDailyItems] = useState([]);
  const [dailyGroups, setDailyGroups] = useState([]);       // selected group names; empty = total
  const [smoothWindow, setSmoothWindow] = useState(7);      // trailing moving-average window in days
  const [trendData, setTrendData] = useState([]);
  const [topStores, setTopStores] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [budgets, setBudgets] = useState([]);
  const [editingBudgets, setEditingBudgets] = useState(false);
  const [budgetInputs, setBudgetInputs] = useState({});
  const [allGroups, setAllGroups] = useState([]);
  const [activeHint, setActiveHint] = useState(null);

  useEffect(() => {
    loadLast30Days();
  }, [displayCurrency, ratesReady]);

  useEffect(() => {
    loadAll();
    // ratesReady triggers a reload once FX rates land so initial render uses real numbers
    // and a display-currency switch refreshes all aggregates without a manual nav.
  }, [month, year, trendSpan, displayCurrency, ratesReady]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  async function loadAll() {
    setLoading(true);
    await Promise.all([
      loadCategorySpending(),
      loadTrend(),
      loadTopStores(),
      loadTopItems(),
      loadBudgets(),
    ]);
    setLoading(false);
  }

  async function loadLast30Days() {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);               // exclusive upper bound: tomorrow 00:00
    const start = new Date(end);
    start.setDate(start.getDate() - 30);          // 30 full days

    const { data: receipts } = await supabase
      .from('receipts')
      .select('id, date, currency')
      .eq('user_id', user.id)
      .gte('date', start.toISOString())
      .lt('date', end.toISOString());

    if (!receipts?.length) { setDailyItems([]); return; }
    const receiptById = Object.fromEntries(receipts.map(r => [r.id, r]));

    const { data: items } = await supabase
      .from('items')
      .select('price, quantity, discount, receipt_id, categories(name, category_groups(name, color))')
      .in('receipt_id', receipts.map(r => r.id))
      .gt('price', 0);

    setDailyItems((items || []).map(item => {
      const r = receiptById[item.receipt_id];
      return {
        date: r?.date,
        currency: r?.currency || 'PLN',
        group: item.categories?.category_groups?.name || 'Other',
        color: item.categories?.category_groups?.color || '#71717a',
        netPrice: (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1) - (parseFloat(item.discount) || 0),
      };
    }));
  }

  async function loadBudgets() {
    const { data: groups } = await supabase.from('category_groups').select('*').order('name');
    if (groups) {
      setAllGroups(groups);
      const inputs = {};
      groups.forEach(g => { inputs[g.id] = ''; });
      setBudgetInputs(prev => {
        const merged = { ...inputs };
        Object.keys(prev).forEach(k => { if (prev[k] !== '') merged[k] = prev[k]; });
        return merged;
      });
    }

    const { data } = await supabase
      .from('budgets')
      .select('*, category_groups(name, color)')
      .eq('user_id', user.id);

    if (data) {
      setBudgets(data);
      setBudgetInputs(prev => {
        const updated = { ...prev };
        data.forEach(b => { updated[b.group_id] = String(b.amount); });
        return updated;
      });
    }
  }

  async function handleBudgetBlur(groupId, value) {
    const amount = parseFloat(value) || 0;
    await supabase.from('budgets').upsert(
      { user_id: user.id, group_id: groupId, amount },
      { onConflict: 'user_id,group_id' }
    );
    setBudgets(prev => {
      const existing = prev.find(b => b.group_id === groupId);
      if (existing) {
        return prev.map(b => b.group_id === groupId ? { ...b, amount } : b);
      }
      const grp = allGroups.find(g => g.id === groupId);
      return [...prev, { group_id: groupId, amount, category_groups: grp ? { name: grp.name, color: grp.color } : null }];
    });
  }

  async function loadCategorySpending() {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const toMonth = month === 11 ? 0 : month + 1;
    const toYear = month === 11 ? year + 1 : year;
    const to = `${toYear}-${String(toMonth + 1).padStart(2, '0')}-01`;

    const { data: receipts } = await supabase
      .from('receipts')
      .select('id, store, date, currency')
      .eq('user_id', user.id)
      .gte('date', from)
      .lt('date', to);

    if (!receipts?.length) { setRawItems([]); return; }
    const ids = receipts.map(r => r.id);
    const receiptById = Object.fromEntries(receipts.map(r => [r.id, r]));

    const { data: items } = await supabase
      .from('items')
      .select('id, name, price, quantity, discount, receipt_id, categories(name, category_groups(name, color))')
      .in('receipt_id', ids)
      .gt('price', 0);

    // Attach receipt meta and compute net line amount (price × qty − discount).
    const enriched = (items || []).map(item => {
      const r = receiptById[item.receipt_id];
      return {
        ...item,
        netPrice: (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1) - (parseFloat(item.discount) || 0),
        currency: r?.currency || 'PLN',
        receipt: r ? { id: r.id, store: r.store, date: r.date } : { id: item.receipt_id, store: null, date: null },
      };
    });
    setRawItems(enriched);
  }

  async function loadTrend() {
    const monthNamesShort = t('monthNamesShort');
    const months = [];
    for (let i = trendSpan - 1; i >= 0; i--) {
      let m = month - i;
      let y = year;
      while (m < 0) { m += 12; y--; }
      months.push({ month: m, year: y });
    }

    const results = await Promise.all(months.map(async ({ month: m, year: y }) => {
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const toM = m === 11 ? 0 : m + 1;
      const toY = m === 11 ? y + 1 : y;
      const to = `${toY}-${String(toM + 1).padStart(2, '0')}-01`;

      const { data } = await supabase
        .from('receipts')
        .select('total, currency')
        .eq('user_id', user.id)
        .gte('date', from)
        .lt('date', to);

      const total = (data || []).reduce((sum, r) => {
        const amount = parseFloat(r.total) || 0;
        return sum + amount * rateTo(r.currency || 'PLN', displayCurrency);
      }, 0);
      return { label: `${monthNamesShort[m]} ${y}`, total: parseFloat(total.toFixed(2)) };
    }));

    setTrendData(results);
  }

  async function loadTopStores() {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const toMonth = month === 11 ? 0 : month + 1;
    const toYear = month === 11 ? year + 1 : year;
    const to = `${toYear}-${String(toMonth + 1).padStart(2, '0')}-01`;

    const { data } = await supabase
      .from('receipts')
      .select('store, total, currency')
      .eq('user_id', user.id)
      .gte('date', from)
      .lt('date', to);

    if (!data) { setTopStores([]); return; }

    const map = {};
    data.forEach(r => {
      const s = r.store || 'Unknown';
      if (!map[s]) map[s] = 0;
      const amount = parseFloat(r.total) || 0;
      map[s] += amount * rateTo(r.currency || 'PLN', displayCurrency);
    });

    const sorted = Object.entries(map)
      .map(([store, total]) => ({ store, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    setTopStores(sorted);
  }

  async function loadTopItems() {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const toMonth = month === 11 ? 0 : month + 1;
    const toYear = month === 11 ? year + 1 : year;
    const to = `${toYear}-${String(toMonth + 1).padStart(2, '0')}-01`;

    const { data: receipts } = await supabase
      .from('receipts')
      .select('id, currency')
      .eq('user_id', user.id)
      .gte('date', from)
      .lt('date', to);

    if (!receipts?.length) { setTopItems([]); return; }
    const ids = receipts.map(r => r.id);
    const currencyByReceipt = Object.fromEntries(receipts.map(r => [r.id, r.currency || 'PLN']));

    const { data: items } = await supabase
      .from('items')
      .select('name, price, quantity, discount, receipt_id')
      .in('receipt_id', ids)
      .gt('price', 0);

    if (!items) { setTopItems([]); return; }

    const map = {};
    items.forEach(item => {
      const key = item.name.toLowerCase();
      if (!map[key]) map[key] = { name: item.name, count: 0, total: 0 };
      // count by quantity so multi-unit lines (qty=3) don't undercount frequency
      const qty = parseFloat(item.quantity) || 1;
      map[key].count += qty >= 1 ? Math.round(qty) : 1;
      const cur = currencyByReceipt[item.receipt_id] || 'PLN';
      const lineAmt = (parseFloat(item.price) || 0) * qty - (parseFloat(item.discount) || 0);
      map[key].total += Math.max(0, lineAmt) * rateTo(cur, displayCurrency);
    });

    const sorted = Object.values(map)
      .map(i => ({ ...i, total: parseFloat(i.total.toFixed(2)) }))
      .sort((a, b) => b.count - a.count || b.total - a.total)
      .slice(0, 5);

    setTopItems(sorted);
  }

  const categoryData = (() => {
    const toDisp = (item) => Math.max(0, item.netPrice ?? (parseFloat(item.price) || 0)) * rateTo(item.currency || 'PLN', displayCurrency);
    if (expandedGroup) {
      const filtered = rawItems.filter(i => i.categories?.category_groups?.name === expandedGroup);
      const map = {};
      filtered.forEach(item => {
        const catName = item.categories?.name || 'Uncategorized';
        const color = item.categories?.category_groups?.color || '#71717a';
        if (!map[catName]) map[catName] = { name: catName, displayName: t('categoryNames')[catName] || catName, color, total: 0 };
        map[catName].total += toDisp(item);
      });
      return Object.values(map)
        .filter(x => x.total > 0)
        .map(c => ({ ...c, total: parseFloat(c.total.toFixed(2)) }))
        .sort((a, b) => b.total - a.total);
    } else {
      const map = {};
      rawItems.forEach(item => {
        const groupName = item.categories?.category_groups?.name || 'Other';
        const color = item.categories?.category_groups?.color || '#71717a';
        if (!map[groupName]) map[groupName] = { name: groupName, displayName: t('categoryGroups')[groupName] || groupName, color, total: 0 };
        map[groupName].total += toDisp(item);
      });
      return Object.values(map)
        .filter(x => x.total > 0)
        .map(c => ({ ...c, total: parseFloat(c.total.toFixed(2)) }))
        .sort((a, b) => b.total - a.total);
    }
  })();

  // Line items matching the current selection (group, optionally narrowed to a
  // subcategory), grouped by receipt and sorted newest first.
  const selectedGroups = useMemo(() => {
    if (!expandedGroup) return [];
    const toDisp = (item) => Math.max(0, item.netPrice ?? (parseFloat(item.price) || 0)) * rateTo(item.currency || 'PLN', displayCurrency);
    const byReceipt = {};
    rawItems.forEach(item => {
      const gName = item.categories?.category_groups?.name || 'Other';
      if (gName !== expandedGroup) return;
      const cName = item.categories?.name || 'Uncategorized';
      if (selectedCategory && cName !== selectedCategory) return;
      const rid = item.receipt.id;
      if (!byReceipt[rid]) byReceipt[rid] = { receipt: item.receipt, items: [], total: 0 };
      const amount = toDisp(item);
      byReceipt[rid].items.push({
        id: item.id,
        name: item.name,
        amount,
        categoryLabel: selectedCategory ? null : (t('categoryNames')[cName] || cName),
      });
      byReceipt[rid].total += amount;
    });
    return Object.values(byReceipt)
      .filter(g => g.total > 0)
      .sort((a, b) => new Date(b.receipt.date || 0) - new Date(a.receipt.date || 0));
  }, [rawItems, expandedGroup, selectedCategory, displayCurrency, ratesReady]);

  const selectedTotal = selectedGroups.reduce((s, g) => s + g.total, 0);
  const selectedCount = selectedGroups.length;
  const selectionLabel = expandedGroup
    ? (selectedCategory
        ? `${t('categoryGroups')[expandedGroup] || expandedGroup} › ${t('categoryNames')[selectedCategory] || selectedCategory}`
        : (t('categoryGroups')[expandedGroup] || expandedGroup))
    : null;

  function clearSelection() {
    setExpandedGroup(null);
    setSelectedCategory(null);
    setSheetOpen(false);
  }

  function handleBarClick(data) {
    const name = data?.activePayload?.[0]?.payload?.name;
    if (!name) return;
    if (!expandedGroup) {
      setExpandedGroup(name);
      setSelectedCategory(null);
    } else {
      setSelectedCategory(prev => (prev === name ? null : name));
    }
  }

  const transactionPanel = (
    <div className="tx-panel">
      <div className="tx-panel-head">
        <div className="tx-panel-title-col">
          <span className="tx-panel-eyebrow text-muted">{t('transactionsFor')}</span>
          <span className="tx-panel-title">{selectionLabel || t('selectCategoryHint')}</span>
        </div>
        {expandedGroup && (
          <button className="btn-icon btn-ghost-small" onClick={clearSelection} aria-label={t('clearSelection')} title={t('clearSelection')}>
            <X size={16} />
          </button>
        )}
      </div>
      {expandedGroup ? (
        <>
          <div className="tx-panel-summary">
            <span className="text-muted">{t('nReceipts').replace('{n}', selectedCount)}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{selectedTotal.toFixed(2)} {displayCurrency}</span>
          </div>
          {selectedCategory && (
            <button className="btn btn-ghost tx-panel-back" onClick={() => setSelectedCategory(null)}>
              ← {t('categoryGroups')[expandedGroup] || expandedGroup}
            </button>
          )}
          <TransactionList groups={selectedGroups} currency={displayCurrency} t={t} onNavigate={() => setSheetOpen(false)} />
        </>
      ) : (
        <p className="text-muted" style={{ fontSize: 13 }}>{t('selectCategoryBody')}</p>
      )}
    </div>
  );

  // ── Last 30 days: daily totals per group, smoothed with a trailing moving average ──
  const daily = useMemo(() => {
    const dayKey = d => {
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const days = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      days.push({ key: dayKey(d), label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) });
    }
    const dayIndex = Object.fromEntries(days.map((d, i) => [d.key, i]));

    // raw[group][dayIdx] = spend in display currency
    const raw = {};
    const groupColor = {};
    const groupTotal = {};
    dailyItems.forEach(item => {
      if (!item.date) return;
      const idx = dayIndex[dayKey(new Date(item.date))];
      if (idx == null) return;
      const amt = Math.max(0, item.netPrice) * rateTo(item.currency, displayCurrency);
      if (!raw[item.group]) { raw[item.group] = new Array(30).fill(0); groupColor[item.group] = item.color; groupTotal[item.group] = 0; }
      raw[item.group][idx] += amt;
      groupTotal[item.group] += amt;
    });

    const availableGroups = Object.keys(raw)
      .sort((a, b) => groupTotal[b] - groupTotal[a])
      .map(name => ({ name, color: groupColor[name], total: groupTotal[name] }));

    const active = dailyGroups.filter(g => raw[g]);
    const series = active.length
      ? active.map(name => ({ name, color: groupColor[name], values: raw[name] }))
      : [{ name: '__total', color: '#8b5cf6', values: days.map((_, i) => Object.values(raw).reduce((s, arr) => s + arr[i], 0)) }];

    const w = Math.max(1, smoothWindow);
    const smooth = values => values.map((_, i) => {
      const from = Math.max(0, i - w + 1);
      let sum = 0;
      for (let j = from; j <= i; j++) sum += values[j];
      return parseFloat((sum / (i - from + 1)).toFixed(2));
    });

    const data = days.map((d, i) => {
      const row = { label: d.label };
      series.forEach(sr => { row[sr.name] = smooth(sr.values)[i]; });
      return row;
    });
    const rawTotal = series.reduce((s, sr) => s + sr.values.reduce((a, b) => a + b, 0), 0);
    return { data, series, availableGroups, rawTotal };
  }, [dailyItems, dailyGroups, smoothWindow, displayCurrency, ratesReady]);

  function toggleDailyGroup(name) {
    setDailyGroups(prev => prev.includes(name) ? prev.filter(g => g !== name) : [...prev, name]);
  }

  const budgetProgressItems = budgets
    .filter(b => parseFloat(b.amount) > 0)
    .map(b => {
      const groupName = b.category_groups?.name || '';
      const color = b.category_groups?.color || '#94a3b8';
      const spent = categoryData.find(c => c.name === groupName && !expandedGroup)?.total || 0;
      const amount = parseFloat(b.amount);
      const pct = Math.min((spent / amount) * 100, 100);
      const over = spent > amount;
      const displayGroupName = t('categoryGroups')[groupName] || groupName;
      return { groupName, displayGroupName, color, spent, amount, pct, over };
    })
    .sort((a, b) => b.pct - a.pct);

  const monthNames = t('monthNames');

  return (
    <div className="analytics-page page">
      <div className="analytics-layout">
      <div className="analytics-main">
      <div className="month-selector">
        <button className="btn-icon" onClick={prevMonth}><ChevronLeft size={20} /></button>
        <span className="month-label">{monthNames[month]} {year}</span>
        <button className="btn-icon" onClick={nextMonth}><ChevronRight size={20} /></button>
      </div>

      {loading ? (
        <div className="skeleton-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-block" style={{ height: '140px', marginBottom: '16px', borderRadius: '12px' }} />
          ))}
        </div>
      ) : (
        <>
          <section className="analytics-section">
            <h3 className="section-title">{t('spendingByCategory')}</h3>
            {expandedGroup && (
              <button
                className="btn btn-ghost"
                style={{ marginBottom: 8, fontSize: 13 }}
                onClick={clearSelection}
              >
                ← {t('categoryGroups')[expandedGroup] || expandedGroup}
              </button>
            )}
            {expandedGroup && !selectedCategory && (
              <p className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>{t('tapSubcategoryHint')}</p>
            )}
            {categoryData.length === 0 ? (
              <p className="text-muted">{t('noDataMonth')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, categoryData.length * 40)}>
                <BarChart
                  data={categoryData}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                  onClick={handleBarClick}
                  style={{ cursor: 'pointer' }}
                >
                  <XAxis type="number" tick={{ fill: '#666', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="displayName" width={110} tick={{ fill: '#f0f0f0', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={v => [`${v.toFixed(2)} ${displayCurrency}`]}
                    contentStyle={{ background: '#141414', border: '1px solid #222', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    labelStyle={{ color: '#f0f0f0' }}
                    itemStyle={{ color: '#f0f0f0' }}
                    cursor={{ fill: '#ffffff0a' }}
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                    {categoryData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.color}
                        fillOpacity={expandedGroup && selectedCategory && entry.name !== selectedCategory ? 0.35 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="analytics-section">
            <div className="section-header-row">
              <div>
                <h3 className="section-title">{t('budgetsTitle')}</h3>
                <span className="section-subtitle">{t('budgetsMonthly')}</span>
              </div>
              <button
                className="btn-icon btn-ghost-small"
                onClick={() => setEditingBudgets(e => !e)}
                title={editingBudgets ? t('doneBudgets') : t('editBudgets')}
              >
                {editingBudgets ? <X size={16} /> : <Pencil size={16} />}
              </button>
            </div>

            {editingBudgets && (
              <div className="budget-edit-panel">
                {allGroups.map(grp => (
                  <div key={grp.id} className="budget-edit-row">
                    <div className="budget-edit-controls">
                      <span className="cat-dot" style={{ background: grp.color }} />
                      <span className="budget-edit-name">{t('categoryGroups')[grp.name] || grp.name}</span>
                      <button
                        className="btn-hint"
                        onClick={() => setActiveHint(activeHint === grp.name ? null : grp.name)}
                        aria-label="Info"
                      >?</button>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-input budget-edit-input"
                        value={budgetInputs[grp.id] ?? ''}
                        onChange={e => setBudgetInputs(prev => ({ ...prev, [grp.id]: e.target.value }))}
                        onBlur={e => handleBudgetBlur(grp.id, e.target.value)}
                        placeholder="0"
                      />
                      <span className="budget-edit-currency">{displayCurrency}</span>
                    </div>
                    {activeHint === grp.name && (
                      <span className="hint-bubble">{t('categoryGroupHints')?.[grp.name]}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!editingBudgets && budgetProgressItems.length === 0 && (
              <p className="text-muted">{t('noDataPeriod')}</p>
            )}

            {!editingBudgets && budgetProgressItems.length > 0 && (
              <div className="budget-progress-list">
                {budgetProgressItems.map(b => (
                  <div key={b.groupName} className="budget-progress-item">
                    <div className="budget-progress-header">
                      <div className="budget-progress-left">
                        <span className="cat-dot" style={{ background: b.color }} />
                        <span className="budget-progress-name">{b.displayGroupName}</span>
                      </div>
                      <span className="budget-progress-values" style={{ fontFamily: 'var(--font-mono)', color: b.over ? '#ef4444' : 'var(--text-muted)' }}>
                        {b.spent.toFixed(2)} / {b.amount.toFixed(2)} {displayCurrency}
                      </span>
                    </div>
                    <div className="budget-bar-track">
                      <div
                        className="budget-bar-fill"
                        style={{
                          width: `${b.pct}%`,
                          background: b.over ? '#ef4444' : b.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div className="budget-totals-row">
                  <span>{t('totalSpent')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {categoryData.reduce((s, c) => s + c.total, 0).toFixed(2)}
                    {' / '}
                    {budgetProgressItems.reduce((s, b) => s + b.amount, 0).toFixed(2)} {displayCurrency}
                  </span>
                </div>
              </div>
            )}
          </section>

          <section className="analytics-section">
            <div className="section-header-row">
              <div>
                <h3 className="section-title">{t('last30Title')}</h3>
                <span className="section-subtitle">
                  {daily.rawTotal.toFixed(2)} {displayCurrency}
                  {dailyGroups.length ? '' : ` · ${t('allCategories')}`}
                </span>
              </div>
            </div>

            <div className="chip-row">
              <button
                className={`chip${dailyGroups.length === 0 ? ' active' : ''}`}
                onClick={() => setDailyGroups([])}
              >
                {t('allCategories')}
              </button>
              {daily.availableGroups.map(g => {
                const on = dailyGroups.includes(g.name);
                return (
                  <button
                    key={g.name}
                    className={`chip${on ? ' active' : ''}`}
                    style={on ? { background: g.color, borderColor: g.color, color: '#0a0a0a' } : { borderColor: g.color + '66' }}
                    onClick={() => toggleDailyGroup(g.name)}
                  >
                    <span className="cat-dot" style={{ background: g.color }} />
                    {t('categoryGroups')[g.name] || g.name}
                  </button>
                );
              })}
            </div>

            <div className="smooth-row">
              <label className="smooth-label text-muted" htmlFor="smooth-range">
                {t('smoothingLabel')}
              </label>
              <input
                id="smooth-range"
                type="range"
                min="1"
                max="14"
                step="1"
                value={smoothWindow}
                onChange={e => setSmoothWindow(parseInt(e.target.value, 10))}
                className="smooth-range"
              />
              <span className="smooth-value" style={{ fontFamily: 'var(--font-mono)' }}>
                {smoothWindow === 1 ? t('smoothingOff') : t('smoothingDays').replace('{n}', smoothWindow)}
              </span>
            </div>

            {daily.data.every(row => daily.series.every(sr => !row[sr.name])) ? (
              <p className="text-muted">{t('noDataPeriod')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={daily.data} margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tick={{ fill: '#666', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip
                    formatter={(v, name) => [`${Number(v).toFixed(2)} ${displayCurrency}`, name === '__total' ? t('totalLabel') : (t('categoryGroups')[name] || name)]}
                    contentStyle={{ background: '#141414', border: '1px solid #222', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    labelStyle={{ color: '#f0f0f0' }}
                  />
                  {daily.series.length > 1 && (
                    <Legend
                      formatter={name => <span style={{ color: '#aaa', fontSize: 11 }}>{t('categoryGroups')[name] || name}</span>}
                    />
                  )}
                  {daily.series.map(sr => (
                    <Line
                      key={sr.name}
                      type="monotone"
                      dataKey={sr.name}
                      stroke={sr.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="analytics-section">
            <h3 className="section-title">{t('monthlyTrend')}</h3>
            <div className="trend-span-selector">
              {[6, 12, 24].map(n => (
                <button
                  key={n}
                  className={`trend-span-btn${trendSpan === n ? ' active' : ''}`}
                  onClick={() => setTrendSpan(n)}
                >
                  {n}mo
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#666', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={v => [`${v.toFixed(2)} ${displayCurrency}`]}
                  contentStyle={{ background: '#141414', border: '1px solid #222', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  labelStyle={{ color: '#f0f0f0' }}
                  itemStyle={{ color: '#f0f0f0' }}
                />
                <Line type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="analytics-section">
            <h3 className="section-title">{t('topStores')}</h3>
            {topStores.length === 0 ? (
              <p className="text-muted">{t('noDataMonth')}</p>
            ) : (
              <ol className="ranked-list">
                {topStores.map((s, i) => (
                  <li key={i} className="ranked-item">
                    <span className="rank-num">{i + 1}</span>
                    <span className="rank-name">{s.store}</span>
                    <span className="rank-value" style={{ fontFamily: 'var(--font-mono)' }}>{s.total.toFixed(2)} {displayCurrency}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="analytics-section">
            <h3 className="section-title">{t('topItems')}</h3>
            {topItems.length === 0 ? (
              <p className="text-muted">{t('noDataMonth')}</p>
            ) : (
              <ol className="ranked-list">
                {topItems.map((item, i) => (
                  <li key={i} className="ranked-item">
                    <span className="rank-num">{i + 1}</span>
                    <span className="rank-name">{item.name}</span>
                    <span className="rank-meta text-muted">×{item.count}</span>
                    <span className="rank-value" style={{ fontFamily: 'var(--font-mono)' }}>{item.total.toFixed(2)} {displayCurrency}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
      </div>

      {/* Desktop: persistent sidebar */}
      <aside className="analytics-sidebar">{transactionPanel}</aside>
      </div>

      {/* Mobile: floating button + bottom sheet */}
      {expandedGroup && !loading && (
        <button className="tx-fab" onClick={() => setSheetOpen(true)}>
          <List size={18} />
          <span className="tx-fab-label">
            <span className="tx-fab-count">{t('nReceipts').replace('{n}', selectedCount)}</span>
            <span className="tx-fab-total" style={{ fontFamily: 'var(--font-mono)' }}>{selectedTotal.toFixed(2)} {displayCurrency}</span>
          </span>
        </button>
      )}
      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <button className="sheet-close btn-icon btn-ghost-small" onClick={() => setSheetOpen(false)} aria-label="Close">
              <X size={18} />
            </button>
            {transactionPanel}
          </div>
        </div>
      )}
    </div>
  );
}
