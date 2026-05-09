import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import CategoryBadge from '../components/CategoryBadge';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(isoStr) {
  if (!isoStr) return null;
  return new Date(isoStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function ReceiptDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: rec } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (!rec) { navigate('/history', { replace: true }); return; }
      setReceipt(rec);

      const { data: its } = await supabase
        .from('items')
        .select('*, categories(name, color)')
        .eq('receipt_id', id)
        .order('created_at');

      setItems(its || []);
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      if (receipt.image_url) {
        const path = receipt.image_url.split('/receipts/')[1];
        if (path) await supabase.storage.from('receipts').remove([decodeURIComponent(path)]);
      }
      const { error: err } = await supabase.from('receipts').delete().eq('id', id);
      if (err) throw err;
      navigate('/history', { replace: true });
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="page detail-page">
        <div className="skeleton-list">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton-block" style={{ height: '20px', marginBottom: '12px' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page detail-page">
      <div className="detail-header">
        <button className="btn-icon" onClick={() => navigate('/history')}>
          <ArrowLeft size={20} />
        </button>
        <h2>{receipt.store || 'Receipt'}</h2>
        <button className="btn-icon btn-danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={20} />
        </button>
      </div>

      {receipt.image_url && (
        <img src={receipt.image_url} alt="Receipt" className="detail-image" />
      )}

      <div className="detail-meta">
        <span className="text-muted">
          {formatDate(receipt.date)}
          {formatTime(receipt.created_at) && (
            <span className="detail-time"> · {formatTime(receipt.created_at)}</span>
          )}
        </span>
        <span className="detail-total" style={{ fontFamily: 'var(--font-mono)' }}>
          {receipt.total != null ? `${Number(receipt.total).toFixed(2)} PLN` : '—'}
        </span>
      </div>

      <div className="items-list">
        {items.map(item => (
          <div key={item.id} className="detail-item">
            <div className="detail-item-left">
              <span className="detail-item-name">{item.name}</span>
              {item.categories && (
                <CategoryBadge name={item.categories.name} color={item.categories.color} />
              )}
            </div>
            <span
              className="detail-item-price"
              style={{
                fontFamily: 'var(--font-mono)',
                color: item.price < 0 ? '#22c55e' : 'var(--text)',
              }}
            >
              {item.price < 0 ? '−' : ''}{Math.abs(item.price).toFixed(2)} PLN
            </span>
          </div>
        ))}
      </div>

      {error && <p className="error-msg">{error}</p>}

      {confirmDelete && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h3>Delete receipt?</h3>
            <p className="text-muted">This action cannot be undone.</p>
            <div className="confirm-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
