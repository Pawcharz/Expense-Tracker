import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2, Plus, X, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useCurrency } from '../hooks/useCurrency';
import { supabase } from '../lib/supabase';
import { fetchCategoryData } from '../lib/categories';

function toDatetimeLocal(val) {
  if (!val) return new Date().toISOString().slice(0, 16);
  if (val.length === 10) return val + 'T00:00';
  return val.slice(0, 16);
}

// True when `dateStr` (datetime-local string) is older than 7 days from now.
function isMoreThanWeekOld(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - d.getTime() > weekMs;
}

export default function Review() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { displayCurrency, supportedCurrencies, toDisplay, format } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state;

  const [store, setStore] = useState(state?.parsedData?.store || '');
  const [date, setDate] = useState(toDatetimeLocal(state?.parsedData?.date));
  const [currency, setCurrency] = useState(
    state?.parsedData?.currency || displayCurrency || 'PLN'
  );
  const [items, setItems] = useState(
    (state?.parsedData?.items || []).map((item, i) => ({
      ...item,
      _id: i,
      discount: item.discount || 0,
      quantity: item.quantity ?? 1,
      category_group: item.category_group || 'Other',
      category: item.category || 'Uncategorized',
    }))
  );
  const [groups, setGroups] = useState([]);
  const [categoriesByGroup, setCategoriesByGroup] = useState({});
  const [categoryMap, setCategoryMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [dateHintOpen, setDateHintOpen] = useState(false);

  const imageUrl = state?.imageUrl;

  useEffect(() => {
    if (!state) {
      navigate('/', { replace: true });
      return;
    }
    fetchCategoryData().then(({ groups: g, categoriesByGroup: cbg, categoryMap: cm }) => {
      setGroups(g);
      setCategoriesByGroup(cbg);
      setCategoryMap(cm);
    });
  }, []);

  // If Gemini didn't return a currency and the display currency arrives later
  // via the async settings load, sync the receipt currency to that default.
  useEffect(() => {
    if (!state?.parsedData?.currency && displayCurrency) {
      setCurrency(c => (c === 'PLN' ? displayCurrency : c));
    }
  }, [displayCurrency]);

  const dateIsOld = useMemo(() => isMoreThanWeekOld(date), [date]);

  if (!state) return null;

  const total = items.reduce(
    (sum, item) => sum + (parseFloat(item.price) || 0) - (parseFloat(item.discount) || 0),
    0
  );

  const showConversion = currency !== displayCurrency;
  const convertedTotal = showConversion ? toDisplay(total, currency) : null;

  function updateItem(id, field, value) {
    setItems(prev => prev.map(item => item._id === id ? { ...item, [field]: value } : item));
  }

  function deleteItem(id) {
    setItems(prev => prev.filter(item => item._id !== id));
  }

  function addItem() {
    const newId = Date.now();
    setItems(prev => [...prev, {
      _id: newId, name: '', price: '', discount: 0, quantity: 1,
      category_group: 'Other', category: 'Uncategorized', raw_name: '',
    }]);
  }

  function handleGroupChange(id, newGroup) {
    const firstCat = categoriesByGroup[newGroup]?.[0]?.name || 'Uncategorized';
    setItems(prev => prev.map(item =>
      item._id === id ? { ...item, category_group: newGroup, category: firstCat } : item
    ));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          user_id: user.id,
          store: store || null,
          date,
          total: parseFloat(total.toFixed(2)),
          currency,
          image_url: imageUrl || null,
        })
        .select()
        .single();

      if (receiptError) throw receiptError;

      const itemsToInsert = items
        .filter(item => item.name && item.price !== '')
        .map(item => ({
          receipt_id: receipt.id,
          name: item.name,
          raw_name: item.raw_name || null,
          price: parseFloat(item.price) || 0,
          discount: parseFloat(item.discount) || 0,
          quantity: parseFloat(item.quantity) || 1,
          category_id: categoryMap[item.category]?.id || null,
        }));

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from('items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      navigate('/history', { replace: true });
    } catch (err) {
      setError(err.message || t('failedToSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="review-page page">
      {modalOpen && imageUrl && (
        <div className="image-modal" onClick={() => setModalOpen(false)}>
          <button className="modal-close" onClick={() => setModalOpen(false)}>
            <X size={24} />
          </button>
          <img src={imageUrl} alt="Receipt" className="modal-image" />
        </div>
      )}

      <div className="review-header">
        <h2>{t('reviewTitle')}</h2>
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Receipt thumbnail"
            className="receipt-thumbnail"
            onClick={() => setModalOpen(true)}
          />
        )}
      </div>

      <div className="form-group">
        <label className="form-label">{t('storeLabel')}</label>
        <input
          type="text"
          className="form-input"
          value={store}
          onChange={e => setStore(e.target.value)}
          placeholder={t('storePlaceholder')}
        />
      </div>

      <div className="form-row-2col">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label date-label-row">
            <span>{t('dateLabel')}</span>
            {dateIsOld && (
              <button
                type="button"
                className="date-warning-btn"
                onClick={() => setDateHintOpen(o => !o)}
                title={t('oldDateWarning')}
                aria-label={t('oldDateWarning')}
              >
                <AlertTriangle size={14} />
              </button>
            )}
          </label>
          <input
            type="datetime-local"
            className="form-input"
            value={date}
            onChange={e => { setDate(e.target.value); setDateHintOpen(false); }}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">{t('currencyLabel')}</label>
          <select
            className="form-select"
            value={currency}
            onChange={e => setCurrency(e.target.value)}
          >
            {supportedCurrencies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {dateIsOld && dateHintOpen && (
        <span className="hint-bubble" style={{ marginTop: 6 }}>
          {t('oldDateWarning')}
        </span>
      )}

      <div className="items-section">
        <h3 className="section-title">{t('itemsLabel')}</h3>
        {items.map(item => (
          <div key={item._id} className="item-row">
            <div className="item-row-top">
              <input
                type="text"
                className="form-input item-name"
                value={item.name}
                onChange={e => updateItem(item._id, 'name', e.target.value)}
                placeholder={t('itemNamePlaceholder')}
              />
              <input
                type="number"
                className="form-input item-qty"
                value={item.quantity}
                onChange={e => updateItem(item._id, 'quantity', e.target.value)}
                placeholder={t('qtyPlaceholder')}
                step="0.001"
                min="0"
                style={{ fontFamily: 'var(--font-mono)' }}
                title={t('qtyShort')}
              />
              <input
                type="number"
                className="form-input item-price"
                value={item.price}
                onChange={e => updateItem(item._id, 'price', e.target.value)}
                placeholder="0.00"
                step="0.01"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <input
                type="number"
                className="form-input item-discount"
                value={item.discount}
                onChange={e => updateItem(item._id, 'discount', e.target.value)}
                placeholder="disc."
                step="0.01"
                min="0"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <button
                className="btn-icon btn-danger"
                onClick={() => deleteItem(item._id)}
                aria-label="Delete item"
              >
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
                onChange={e => updateItem(item._id, 'category', e.target.value)}
              >
                {(categoriesByGroup[item.category_group] || []).map(c => (
                  <option key={c.name} value={c.name}>{t('categoryNames')[c.name] || c.name}</option>
                ))}
              </select>
            </div>
          </div>
        ))}

        <button className="btn btn-ghost add-item-btn" onClick={addItem}>
          <Plus size={16} />
          {t('addItem')}
        </button>
      </div>

      <div className="total-row">
        <span>{t('totalLabel')}</span>
        <span className="total-amount" style={{ fontFamily: 'var(--font-mono)' }}>
          {total.toFixed(2)} {currency}
        </span>
      </div>
      {showConversion && convertedTotal != null && (
        <div className="total-converted text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
          ≈ {format(convertedTotal, displayCurrency)}
        </div>
      )}

      {error && <p className="error-msg">{error}</p>}

      <div className="review-actions">
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          {t('discard')}
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t('saving') : t('saveReceipt')}
        </button>
      </div>
    </div>
  );
}
