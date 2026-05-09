import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { supabase } from '../lib/supabase';
import { fetchCategoryData } from '../lib/categories';

export default function ManualEntry() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [store, setStore] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([{ _id: 0, name: '', price: '', category_group: 'Other', category: 'Uncategorized', raw_name: '' }]);
  const [groups, setGroups] = useState([]);
  const [categoriesByGroup, setCategoriesByGroup] = useState({});
  const [categoryMap, setCategoryMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCategoryData().then(({ groups: g, categoriesByGroup: cbg, categoryMap: cm }) => {
      setGroups(g);
      setCategoriesByGroup(cbg);
      setCategoryMap(cm);
    });
  }, []);

  const total = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

  function updateItem(id, field, value) {
    setItems(prev => prev.map(item => item._id === id ? { ...item, [field]: value } : item));
  }

  function deleteItem(id) {
    setItems(prev => prev.filter(item => item._id !== id));
  }

  function addItem() {
    setItems(prev => [...prev, { _id: Date.now(), name: '', price: '', category_group: 'Other', category: 'Uncategorized', raw_name: '' }]);
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
        .insert({ user_id: user.id, store: store || null, date, total: parseFloat(total.toFixed(2)), image_url: null })
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
      <div className="review-header">
        <h2 className="review-title">{t('newReceiptTitle')}</h2>
      </div>

      <div className="review-form">
        <div className="form-group">
          <label className="form-label">{t('storeLabel')}</label>
          <input
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

        <div className="form-group">
          <label className="form-label">{t('itemsLabel')}</label>
          <div className="items-editor">
            {items.map(item => (
              <div key={item._id} className="item-row">
                <div className="item-row-top">
                  <input
                    className="form-input item-name"
                    value={item.name}
                    onChange={e => updateItem(item._id, 'name', e.target.value)}
                    placeholder={t('itemNamePlaceholder')}
                  />
                  <input
                    type="number"
                    step="0.01"
                    className="form-input item-price"
                    value={item.price}
                    onChange={e => updateItem(item._id, 'price', e.target.value)}
                    placeholder="0.00"
                  />
                  <button
                    className="btn-icon btn-danger"
                    onClick={() => deleteItem(item._id)}
                    type="button"
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
                      <option key={g.name} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                  <select
                    className="form-select"
                    value={item.category}
                    onChange={e => updateItem(item._id, 'category', e.target.value)}
                  >
                    {(categoriesByGroup[item.category_group] || []).map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost add-item-btn" onClick={addItem} type="button">
              <Plus size={16} />
              {t('addItem')}
            </button>
          </div>
        </div>

        <div className="review-total">
          <span>{t('totalLabel')}</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{total.toFixed(2)} PLN</span>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <div className="review-actions">
          <button
            className="btn btn-ghost"
            onClick={() => navigate('/')}
            disabled={saving}
          >
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
    </div>
  );
}
