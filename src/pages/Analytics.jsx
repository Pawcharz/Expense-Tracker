import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';

export default function Analytics() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [trendSpan, setTrendSpan] = useState(6);
  const [rawItems, setRawItems] = useState([]);
  const [expandedGroup, setExpandedGroup] = useState(null);
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
    loadAll();
  }, [month, year, trendSpan]);

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
      .select('id')
      .eq('user_id', user.id)
      .gte('date', from)
      .lt('date', to);

    if (!receipts?.length) { setRawItems([]); return; }
    const ids = receipts.map(r => r.id);

    const { data: items } = await supabase
      .from('items')
      .select('price, categories(name, category_groups(name, color))')
      .in('receipt_id', ids)
      .gt('price', 0);

    setRawItems(items || []);
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
        .select('total')
        .eq('user_id', user.id)
        .gte('date', from)
        .lt('date', to);

      const total = (data || []).reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
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
      .select('store, total')
      .eq('user_id', user.id)
      .gte('date', from)
      .lt('date', to);

    if (!data) { setTopStores([]); return; }

    const map = {};
    data.forEach(r => {
      const s = r.store || 'Unknown';
      if (!map[s]) map[s] = 0;
      map[s] += parseFloat(r.total) || 0;
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
      .select('id')
      .eq('user_id', user.id)
      .gte('date', from)
      .lt('date', to);

    if (!receipts?.length) { setTopItems([]); return; }
    const ids = receipts.map(r => r.id);

    const { data: items } = await supabase
      .from('items')
      .select('name, price')
      .in('receipt_id', ids)
      .gt('price', 0);

    if (!items) { setTopItems([]); return; }

    const map = {};
    items.forEach(item => {
      const key = item.name.toLowerCase();
      if (!map[key]) map[key] = { name: item.name, count: 0, total: 0 };
      map[key].count++;
      map[key].total += parseFloat(item.price) || 0;
    });

    const sorted = Object.values(map)
      .map(i => ({ ...i, total: parseFloat(i.total.toFixed(2)) }))
      .sort((a, b) => b.count - a.count || b.total - a.total)
      .slice(0, 5);

    setTopItems(sorted);
  }

  const categoryData = (() => {
    if (expandedGroup) {
      const filtered = rawItems.filter(i => i.categories?.category_groups?.name === expandedGroup);
      const map = {};
      filtered.forEach(item => {
        const catName = item.categories?.name || 'Uncategorized';
        const color = item.categories?.category_groups?.color || '#71717a';
        if (!map[catName]) map[catName] = { name: catName, displayName: t('categoryNames')[catName] || catName, color, total: 0 };
        map[catName].total += parseFloat(item.price) || 0;
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
        map[groupName].total += parseFloat(item.price) || 0;
      });
      return Object.values(map)
        .filter(x => x.total > 0)
        .map(c => ({ ...c, total: parseFloat(c.total.toFixed(2)) }))
        .sort((a, b) => b.total - a.total);
    }
  })();

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
                onClick={() => setExpandedGroup(null)}
              >
                ← {t('categoryGroups')[expandedGroup] || expandedGroup}
              </button>
            )}
            {categoryData.length === 0 ? (
              <p className="text-muted">{t('noDataMonth')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, categoryData.length * 40)}>
                <BarChart
                  data={categoryData}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                  onClick={(data) => {
                    if (!expandedGroup && data?.activePayload?.[0]) {
                      setExpandedGroup(data.activePayload[0].payload.name);
                    }
                  }}
                  style={{ cursor: expandedGroup ? 'default' : 'pointer' }}
                >
                  <XAxis type="number" tick={{ fill: '#666', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="displayName" width={110} tick={{ fill: '#f0f0f0', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={v => [`${v.toFixed(2)} PLN`]}
                    contentStyle={{ background: '#141414', border: '1px solid #222', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    labelStyle={{ color: '#f0f0f0' }}
                    itemStyle={{ color: '#f0f0f0' }}
                    cursor={{ fill: '#ffffff0a' }}
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                    {categoryData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
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
                      <span className="budget-edit-currency">PLN</span>
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
                        {b.spent.toFixed(2)} / {b.amount.toFixed(2)} PLN
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
                    {budgetProgressItems.reduce((s, b) => s + b.spent, 0).toFixed(2)}
                    {' / '}
                    {budgetProgressItems.reduce((s, b) => s + b.amount, 0).toFixed(2)} PLN
                  </span>
                </div>
              </div>
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
                  formatter={v => [`${v.toFixed(2)} PLN`]}
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
                    <span className="rank-value" style={{ fontFamily: 'var(--font-mono)' }}>{s.total.toFixed(2)} PLN</span>
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
                    <span className="rank-value" style={{ fontFamily: 'var(--font-mono)' }}>{item.total.toFixed(2)} PLN</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
