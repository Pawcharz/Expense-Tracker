import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash2, ArrowLeft, Pencil, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import CategoryBadge from '../components/CategoryBadge';

const CATEGORY_NAMES = [
  'Meat', 'Dairy', 'Vegetables', 'Fruit', 'Bread & Bakery',
  'Drinks', 'Snacks', 'Household', 'Hygiene', 'Subscriptions', 'Dining', 'Other',
];

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

  const [editing, setEditing] = useState(false);
  const [editStore, setEditStore] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editItems, setEditItems] = useState([]);
  const [saving, setSaving] = useState(false);

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

  function startEditing() {
    setEditStore(receipt.store || '');
    setEditDate(receipt.date || '');
    setEditItems(items.map((item, i) => ({
      _id: i,
      name: item.name,
      price: String(item.price),
      category: item.categories?.name || 'Other',
    })));
    setError('');
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError('');
  }

  function updateEditItem(editId, field, value) {
    setEditItems(prev => prev.map(item => item._id === editId ? { ...item, [field]: value } : item));
  }

  function deleteEditItem(editId) {
    setEditItems(prev => prev.filter(item => item._id !== editId));
  }

  function addEditItem() {
    setEditItems(prev => [...prev, { _id: Date.now(), name: '', price: '', category: 'Other' }]);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const editTotal = editItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

      const { error: recErr } = await supabase
        .from('receipts')
        .update({ store: editStore || null, date: editDate, total: parseFloat(editTotal.toFixed(2)) })
        .eq('id', receipt.id);
      if (recErr) throw recErr;

      const { error: delErr } = await supabase.from('items').delete().eq('receipt_id', receipt.id);
      if (delErr) throw delErr;

      const { data: cats } = await supabase.from('categories').select('*');
      const categoryMap = {};
      (cats || []).forEach(c => { categoryMap[c.name] = c.id; });

      const itemsToInsert = editItems
        .filter(item => item.name && item.price !== '')
        .map(item => ({
          receipt_id: receipt.id,
          name: item.name,
          raw_name: null,
          price: parseFloat(item.price) || 0,
          category_id: categoryMap[item.category] || null,
        }));

      if (itemsToInsert.length > 0) {
        const { error: insErr } = await supabase.from('items').insert(itemsToInsert);
        if (insErr) throw insErr;
      }

      const { data: updatedRec } = await supabase.from('receipts').select('*').eq('id', receipt.id).single();
      const { data: updatedItems } = await supabase
        .from('items')
        .select('*, categories(name, color)')
        .eq('receipt_id', receipt.id)
        .order('created_at');

      setReceipt(updatedRec);
      setItems(updatedItems || []);
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

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

  const editTotal = editItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

  return (
    <div className="page detail-page">
      <div className="detail-header">
        <button className="btn-icon" onClick={() => editing ? cancelEditing() : navigate('/history')}>
          <ArrowLeft size={20} />
        </button>
        {editing ? (
          <input
            className="form-input"
            value={editStore}
            onChange={e => setEditStore(e.target.value)}
            placeholder="Store name"
            style={{ flex: 1, margin: '0 8px' }}
          />
        ) : (
          <h2>{receipt.store || 'Receipt'}</h2>
        )}
        {editing ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-ghost" onClick={cancelEditing} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-icon" onClick={startEditing} title="Edit receipt">
              <Pencil size={20} />
            </button>
            <button className="btn-icon btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={20} />
            </button>
          </div>
        )}
      </div>

      {receipt.image_url && !editing && (
        <img src={receipt.image_url} alt="Receipt" className="detail-image" />
      )}

      <div className="detail-meta">
        {editing ? (
          <input
            type="date"
            className="form-input"
            value={editDate}
            onChange={e => setEditDate(e.target.value)}
            style={{ width: 'auto' }}
          />
        ) : (
          <span className="text-muted">
            {formatDate(receipt.date)}
            {formatTime(receipt.created_at) && (
              <span className="detail-time"> · {formatTime(receipt.created_at)}</span>
            )}
          </span>
        )}
        <span className="detail-total" style={{ fontFamily: 'var(--font-mono)' }}>
          {editing
            ? `${editTotal.toFixed(2)} PLN`
            : receipt.total != null ? `${Number(receipt.total).toFixed(2)} PLN` : '—'}
        </span>
      </div>

      {editing ? (
        <div className="items-list">
          {editItems.map(item => (
            <div key={item._id} className="edit-item-row">
              <input
                className="form-input edit-item-name"
                value={item.name}
                onChange={e => updateEditItem(item._id, 'name', e.target.value)}
                placeholder="Item name"
              />
              <input
                type="number"
                step="0.01"
                className="form-input edit-item-price"
                value={item.price}
                onChange={e => updateEditItem(item._id, 'price', e.target.value)}
                placeholder="0.00"
              />
              <select
                className="form-select edit-item-category"
                value={item.category}
                onChange={e => updateEditItem(item._id, 'category', e.target.value)}
              >
                {CATEGORY_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn-icon btn-danger" onClick={() => deleteEditItem(item._id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={addEditItem} style={{ marginTop: '8px', width: '100%' }}>
            <Plus size={16} />
            Add item
          </button>
        </div>
      ) : (
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
      )}

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
