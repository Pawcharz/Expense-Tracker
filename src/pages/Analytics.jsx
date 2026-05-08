import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function Analytics() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [categoryData, setCategoryData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [topStores, setTopStores] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, [month, year]);

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
    ]);
    setLoading(false);
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

    if (!receipts?.length) { setCategoryData([]); return; }
    const ids = receipts.map(r => r.id);

    const { data: items } = await supabase
      .from('items')
      .select('price, categories(name, color)')
      .in('receipt_id', ids)
      .gt('price', 0);

    if (!items) { setCategoryData([]); return; }

    const map = {};
    items.forEach(item => {
      const catName = item.categories?.name || 'Other';
      const color = item.categories?.color || '#94a3b8';
      if (!map[catName]) map[catName] = { name: catName, color, total: 0 };
      map[catName].total += parseFloat(item.price) || 0;
    });

    const sorted = Object.values(map)
      .map(c => ({ ...c, total: parseFloat(c.total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);

    setCategoryData(sorted);
  }

  async function loadTrend() {
    const months = [];
    for (let i = 5; i >= 0; i--) {
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
      return { label: `${MONTHS[m]} ${y}`, total: parseFloat(total.toFixed(2)) };
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

  return (
    <div className="analytics-page page">
      <div className="month-selector">
        <button className="btn-icon" onClick={prevMonth}><ChevronLeft size={20} /></button>
        <span className="month-label">{MONTHS_FULL[month]} {year}</span>
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
            <h3 className="section-title">Spending by Category</h3>
            {categoryData.length === 0 ? (
              <p className="text-muted">No data for this month.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, categoryData.length * 40)}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" tick={{ fill: '#666', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#f0f0f0', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={v => [`${v.toFixed(2)} PLN`]}
                    contentStyle={{ background: '#141414', border: '1px solid #222', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    labelStyle={{ color: '#f0f0f0' }}
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
            <h3 className="section-title">Monthly Trend (6 months)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#666', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={v => [`${v.toFixed(2)} PLN`]}
                  contentStyle={{ background: '#141414', border: '1px solid #222', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  labelStyle={{ color: '#f0f0f0' }}
                />
                <Line type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="analytics-section">
            <h3 className="section-title">Top Stores</h3>
            {topStores.length === 0 ? (
              <p className="text-muted">No data for this month.</p>
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
            <h3 className="section-title">Top Items</h3>
            {topItems.length === 0 ? (
              <p className="text-muted">No data for this month.</p>
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
