import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2, Plus, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { supabase } from '../lib/supabase';

const CATEGORY_NAMES = [
  'Meat', 'Dairy', 'Vegetables', 'Fruit', 'Bread & Bakery',
  'Drinks', 'Snacks', 'Household', 'Hygiene', 'Subscriptions', 'Dining', 'Other',
];

const CATEGORY_KEYS = {
  'Meat': 'categoryMeat', 'Dairy': 'categoryDairy', 'Vegetables': 'categoryVegetables',
  'Fruit': 'categoryFruit', 'Bread & Bakery': 'categoryBread', 'Drinks': 'categoryDrinks',
  'Snacks': 'categorySnacks', 'Household': 'categoryHousehold', 'Hygiene': 'categoryHygiene',
  'Subscriptions': 'categorySubscriptions', 'Dining': 'categoryDining', 'Other': 'categoryOther',
};

export default function Review() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state;

  const [store, setStore] = useState(state?.parsedData?.store || '');
  const [date, setDate] = useState(state?.parsedData?.date || new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState(
    (state?.parsedData?.items || []).map((item, i) => ({ ...item, _id: i }))
  );
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const imageUrl = state?.imageUrl;

  useEffect(() => {
    if (!state) {
      navigate('/', { replace: true });
      return;
    }
    supabase.from('categories').select('*').then(({ data }) => {
      if (data) setCategories(data);
    });
  }, []);

  if (!state) return null;

  const total = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

  function updateItem(id, field, value) {
    setItems(prev => prev.map(item => item._id === id ? { ...item, [field]: value } : item));
  }

  function deleteItem(id) {
    setItems(prev => prev.filter(item => item._id !== id));
  }

  function addItem() {
    const newId = Date.now();
    setItems(prev => [...prev, { _id: newId, name: '', price: '', category: 'Other', raw_name: '' }]);
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
          image_url: imageUrl || null,
        })
        .select()
        .single();

      if (receiptError) throw receiptError;

      const categoryMap = {};
      categories.forEach(c => { categoryMap[c.name] = c.id; });

      const itemsToInsert = items
        .filter(item => item.name && item.price !== '')
        .map(item => ({
          receipt_id: receipt.id,
          name: item.name,
          raw_name: item.raw_name || null,
          price: parseFloat(item.price) || 0,
          category_id: categoryMap[item.category] || null,
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

      <div className="form-group">
        <label className="form-label">{t('dateLabel')}</label>
        <input
          type="date"
          className="form-input"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      <div className="items-section">
        <h3 className="section-title">{t('itemsLabel')}</h3>
        {items.map(item => (
          <div key={item._id} className="item-row">
            <input
              type="text"
              className="form-input item-name"
              value={item.name}
              onChange={e => updateItem(item._id, 'name', e.target.value)}
              placeholder={t('itemNamePlaceholder')}
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
            <select
              className="form-select item-category"
              value={item.category || 'Other'}
              onChange={e => updateItem(item._id, 'category', e.target.value)}
            >
              {CATEGORY_NAMES.map(cat => (
                <option key={cat} value={cat}>{t(CATEGORY_KEYS[cat])}</option>
              ))}
            </select>
            <button
              className="btn-icon btn-danger"
              onClick={() => deleteItem(item._id)}
              aria-label="Delete item"
            >
              <Trash2 size={16} />
            </button>
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
          {total.toFixed(2)} PLN
        </span>
      </div>

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
