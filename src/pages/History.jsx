import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import ReceiptCard from '../components/ReceiptCard';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PAGE_SIZE = 20;

export default function History() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setReceipts([]);
    setPage(0);
    loadReceipts(0, true);
  }, [month, year]);

  async function loadReceipts(pageNum = 0, reset = false) {
    setLoading(true);
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const toMonth = month === 11 ? 0 : month + 1;
    const toYear = month === 11 ? year + 1 : year;
    const to = `${toYear}-${String(toMonth + 1).padStart(2, '0')}-01`;

    const { data, error } = await supabase
      .from('receipts')
      .select('*, items(count)')
      .eq('user_id', user.id)
      .gte('date', from)
      .lt('date', to)
      .order('created_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

    setLoading(false);
    if (error) return;

    const mapped = (data || []).map(r => ({
      ...r,
      item_count: r.items?.[0]?.count ?? 0,
    }));

    setReceipts(prev => reset ? mapped : [...prev, ...mapped]);
    setHasMore(data?.length === PAGE_SIZE);
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function loadMore() {
    const next = page + 1;
    setPage(next);
    loadReceipts(next);
  }

  return (
    <div className="history-page page">
      <div className="month-selector">
        <button className="btn-icon" onClick={prevMonth}><ChevronLeft size={20} /></button>
        <span className="month-label">{MONTHS[month]} {year}</span>
        <button className="btn-icon" onClick={nextMonth}><ChevronRight size={20} /></button>
      </div>

      {loading && receipts.length === 0 ? (
        <div className="skeleton-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-block" style={{ width: '60%', height: '18px' }} />
              <div className="skeleton-block" style={{ width: '40%', height: '14px', marginTop: '8px' }} />
            </div>
          ))}
        </div>
      ) : receipts.length === 0 ? (
        <div className="empty-state">
          <p>No receipts for {MONTHS[month]} {year}</p>
        </div>
      ) : (
        <>
          {receipts.map(r => <ReceiptCard key={r.id} receipt={r} />)}
          {hasMore && (
            <button className="btn btn-secondary load-more" onClick={loadMore} disabled={loading}>
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
