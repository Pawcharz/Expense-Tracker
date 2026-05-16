import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash2, ArrowLeft, Pencil, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useCurrency } from '../hooks/useCurrency';
import CategoryBadge from '../components/CategoryBadge';
import { fetchCategoryData } from '../lib/categories';

function formatReceiptDate(val) {
  if (!val) return '';
  const str = String(val);
  // Date-only string (10 chars): new Date('YYYY-MM-DD') parses as UTC midnight
  // which shows as 02:00 in UTC+2 — force local interpretation by appending T00:00
  if (str.length === 10) {
    const d = new Date(str + 'T00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const d = new Date(str);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (d.getHours() === 0 && d.getMinutes() === 0) return date;
  return `${date}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toDatetimeLocal(val) {
  if (!val) return new Date().toISOString().slice(0, 16);
  if (val.length === 10) return val + 'T00:00';
  return val.slice(0, 16);
}

// Quantity display helper — hides "× 1" for the common case.
function formatQty(q) {
  const n = Number(q);
  if (!isFinite(n) || n === 1) return '';
  // Trim trailing zeros for fractional weights e.g. 0.500 → 0.5
  return `× ${String(n).replace(/\.?0+$/, '')} `;
}


export default function ReceiptDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { displayCurrency, supportedCurrencies, toDisplay, format } = useCurrency();
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
  const [editCurrency, setEditCurrency] = useState('PLN');
  const [editItems, setEditItems] = useState([]);
  const [saving, setSaving] = useState(false);

  const [groups, setGroups] = useState([]);
  const [categoriesByGroup, setCategoriesByGroup] = useState({});
  const [categoryMap, setCategoryMap] = useState({});

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
        .select('*, categories(name, category_groups(name, color))')
        .eq('receipt_id', id)
        .order('created_at');

      setItems(its || []);

      const { groups: g, categoriesByGroup: cbg, categoryMap: cm } = await fetchCategoryData();
      setGroups(g);
      setCategoriesByGroup(cbg);
      setCategoryMap(cm);

      setLoading(false);
    }
    load();
  }, [id]);

  function startEditing() {
    setEditStore(receipt.store || '');
    setEditDate(toDatetimeLocal(receipt.date));
    setEditCurrency(receipt.currency || 'PLN');
    setEditItems(items.map((item, i) => ({
      _id: i,
      name: item.name,
      price: String(item.price),
      discount: String(item.discount || 0),
      quantity: String(item.quantity ?? 1),
      category_group: item.categories?.category_groups?.name || 'Other',
      category: item.categories?.name || 'Uncategorized',
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
    setEditItems(prev => [...prev, {
      _id: Date.now(), name: '', price: '', discount: '0', quantity: '1',
      category_group: 'Other', category: 'Uncategorized',
    }]);
  }

  function handleGroupChange(editId, newGroup) {
    const firstCat = categoriesByGroup[newGroup]?.[0]?.name || 'Uncategorized';
    setEditItems(prev => prev.map(item =>
      item._id === editId ? { ...item, category_group: newGroup, category: firstCat } : item
    ));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const editTotal = editItems.reduce(
        (sum, item) => sum + (parseFloat(item.price) || 0) - (parseFloat(item.discount) || 0),
        0
      );

      const { error: recErr } = await supabase
        .from('receipts')
        .update({
          store: editStore || null,
          date: editDate,
          total: parseFloat(editTotal.toFixed(2)),
          currency: editCurrency,
        })
        .eq('id', receipt.id);
      if (recErr) throw recErr;

      const { error: delErr } = await supabase.from('items').delete().eq('receipt_id', receipt.id);
      if (delErr) throw delErr;

      const itemsToInsert = editItems
        .filter(item => item.name && item.price !== '')
        .map(item => ({
          receipt_id: receipt.id,
          name: item.name,
          raw_name: null,
          price: parseFloat(item.price) || 0,
          discount: parseFloat(item.discount) || 0,
          quantity: parseFloat(item.quantity) || 1,
          category_id: categoryMap[item.category]?.id || null,
        }));

      if (itemsToInsert.length > 0) {
        const { error: insErr } = await supabase.from('items').insert(itemsToInsert);
        if (insErr) throw insErr;
      }

      const { data: updatedRec } = await supabase.from('receipts').select('*').eq('id', receipt.id).single();
      const { data: updatedItems } = await supabase
        .from('items')
        .select('*, categories(name, category_groups(name, color))')
        .eq('receipt_id', receipt.id)
        .order('created_at');

      setReceipt(updatedRec);
      setItems(updatedItems || []);
      setEditing(false);
    } catch (err) {
      setError(err.message || t('failedToSave'));
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

  const editTotal = editItems.reduce(
    (sum, item) => sum + (parseFloat(item.price) || 0) - (parseFloat(item.discount) || 0),
    0
  );

  const receiptCurrency = receipt.currency || 'PLN';
  const showConversion = receiptCurrency !== displayCurrency;
  const totalNum = receipt.total != null ? Number(receipt.total) : null;
  const convertedTotal = showConversion && totalNum != null
    ? toDisplay(totalNum, receiptCurrency)
    : null;

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
            placeholder={t('storePlaceholder')}
            style={{ flex: 1, margin: '0 8px' }}
          />
        ) : (
          <h2>{receipt.store || 'Receipt'}</h2>
        )}
        {editing ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-ghost" onClick={cancelEditing} disabled={saving}>{t('cancel')}</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? t('saving') : t('saveChanges')}
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

      {editing && (
        <div className="form-row-2col" style={{ marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('dateLabel')}</label>
            <input
              type="datetime-local"
              className="form-input"
              value={editDate}
              onChange={e => setEditDate(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('currencyLabel')}</label>
            <select
              className="form-select"
              value={editCurrency}
              onChange={e => setEditCurrency(e.target.value)}
            >
              {supportedCurrencies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!editing && (
        <div className="detail-meta">
          <span className="text-muted">
            {formatReceiptDate(receipt.date)}
          </span>
          <div style={{ textAlign: 'right' }}>
            <span className="detail-total" style={{ fontFamily: 'var(--font-mono)' }}>
              {totalNum != null ? `${totalNum.toFixed(2)} ${receiptCurrency}` : '—'}
            </span>
            {showConversion && convertedTotal != null && (
              <div className="text-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 2 }}>
                ≈ {format(convertedTotal, displayCurrency)}
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="detail-meta">
          <span className="text-muted">{t('totalLabel')}</span>
          <span className="detail-total" style={{ fontFamily: 'var(--font-mono)' }}>
            {editTotal.toFixed(2)} {editCurrency}
          </span>
        </div>
      )}

      {editing ? (
        <div className="items-list">
          {editItems.map(item => (
            <div key={item._id} className="item-row">
              <div className="item-row-top">
                <input
                  className="form-input"
                  value={item.name}
                  onChange={e => updateEditItem(item._id, 'name', e.target.value)}
                  placeholder={t('itemNamePlaceholder')}
                />
                <input
                  type="number"
                  className="form-input item-qty"
                  value={item.quantity}
                  onChange={e => updateEditItem(item._id, 'quantity', e.target.value)}
                  placeholder={t('qtyPlaceholder')}
                  step="0.001"
                  min="0"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  title={t('qtyShort')}
                />
                <input
                  type="number"
                  step="0.01"
                  className="form-input item-price"
                  value={item.price}
                  onChange={e => updateEditItem(item._id, 'price', e.target.value)}
                  placeholder="0.00"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <input
                  type="number"
                  className="form-input item-discount"
                  value={item.discount}
                  onChange={e => updateEditItem(item._id, 'discount', e.target.value)}
                  placeholder="disc."
                  step="0.01"
                  min="0"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <button className="btn-icon btn-danger" onClick={() => deleteEditItem(item._id)}>
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="item-row-bottom">
                <select
                  className="form-select"
                  value={item.category_group}
                  onChange={e => handleGroupChange(item._id, e.target.value)}
                >
                  {groups.map(g => (
                    <option key={g.name} value={g.name}>{t('categoryGroups')[g.name] || g.name}</option>
                  ))}
                </select>
                <select
                  className="form-select"
                  value={item.category}
                  onChange={e => updateEditItem(item._id, 'category', e.target.value)}
                >
                  {(categoriesByGroup[item.category_group] || []).map(c => (
                    <option key={c.name} value={c.name}>{t('categoryNames')[c.name] || c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={addEditItem} style={{ marginTop: '8px', width: '100%' }}>
            <Plus size={16} />
            {t('addItem')}
          </button>
        </div>
      ) : (
        <div className="items-list">
          {items.map(item => {
            const qtyLabel = formatQty(item.quantity);
            return (
              <div key={item.id} className="detail-item">
                <div className="detail-item-left">
                  <span className="detail-item-name">
                    {qtyLabel}{item.name}
                  </span>
                  {item.categories && (
                    <CategoryBadge
                      name={item.categories.name}
                      color={item.categories.category_groups?.color || '#71717a'}
                    />
                  )}
                </div>
                {item.discount > 0 ? (
                  <span className="detail-item-price" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '11px' }}>
                      {item.price.toFixed(2)}
                    </span>
                    {' '}
                    <span style={{ color: '#22c55e' }}>-{item.discount.toFixed(2)}</span>
                    {' = '}
                    {(item.price - item.discount).toFixed(2)} {receiptCurrency}
                  </span>
                ) : (
                  <span
                    className="detail-item-price"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: item.price < 0 ? '#22c55e' : 'var(--text)',
                    }}
                  >
                    {item.price < 0 ? '−' : ''}{Math.abs(item.price).toFixed(2)} {receiptCurrency}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="error-msg">{error}</p>}

      {confirmDelete && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h3>{t('deleteReceiptTitle')}</h3>
            <p className="text-muted">{t('cannotUndo')}</p>
            <div className="confirm-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                {t('cancel')}
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? t('deleting') : t('deleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
