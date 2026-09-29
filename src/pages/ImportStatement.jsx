import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image, AlertTriangle, Copy, Trash2, ChevronLeft } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useCurrency } from '../hooks/useCurrency';
import { supabase } from '../lib/supabase';
import { parseBankStatementImage, getImageChunks } from '../lib/gemini';
import { fetchCategoryData } from '../lib/categories';
import { fetchExistingReceiptsAround, findDuplicate } from '../lib/duplicates';

function toDatetimeLocal(val) {
  const pad = n => String(n).padStart(2, '0');
  const d = val ? new Date(val.length === 10 ? val + 'T12:00' : val) : new Date();
  const safe = isNaN(d.getTime()) ? new Date() : d;
  return `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}T${pad(safe.getHours())}:${pad(safe.getMinutes())}`;
}

export default function ImportStatement() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { displayCurrency, supportedCurrencies } = useCurrency();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [stage, setStage] = useState('pick');   // 'pick' | 'review'
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);
  const [groups, setGroups] = useState([]);
  const [categoriesByGroup, setCategoriesByGroup] = useState({});
  const [categoryMap, setCategoryMap] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCategoryData().then(({ groups: g, categoriesByGroup: cbg, categoryMap: cm }) => {
      setGroups(g);
      setCategoriesByGroup(cbg);
      setCategoryMap(cm);
    });
  }, []);

  async function processFile(file) {
    if (!file) return;
    setLoading(true);
    setError('');
    setLoadingMsg(t('readingStatement'));

    try {
      const mimeType = file.type || 'image/jpeg';
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${user.id}/statements/${crypto.randomUUID()}.${fileExt}`;

      const [uploadResult, chunks] = await Promise.all([
        supabase.storage.from('receipts').upload(fileName, file, { contentType: mimeType }),
        getImageChunks(file),
      ]);
      if (uploadResult.error) throw uploadResult.error;
      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);
      setImageUrl(publicUrl);

      const parsed = await parseBankStatementImage(chunks, language);
      if (!parsed.transactions.length) throw new Error(t('noTransactionsFound'));

      setLoadingMsg(t('checkingDuplicates'));
      const existing = await fetchExistingReceiptsAround(user.id, parsed.transactions);

      const fallbackCurrency = parsed.currency || displayCurrency || 'PLN';
      const nextRows = parsed.transactions.map((tx, i) => {
        const currency = tx.currency || fallbackCurrency;
        const dup = findDuplicate({ ...tx, currency }, existing);
        return {
          _id: i,
          merchant: tx.merchant,
          raw_description: tx.raw_description,
          date: toDatetimeLocal(tx.date),
          dateInferred: !tx.date,
          amount: tx.amount ? tx.amount.toFixed(2) : '',
          currency,
          is_expense: tx.is_expense,
          category_group: tx.category_group,
          category: tx.category,
          duplicate: dup,
          // Exact duplicates and incoming money are unchecked by default.
          selected: dup?.level !== 'exact' && tx.is_expense,
        };
      });

      setRows(nextRows);
      setStage('review');
    } catch (err) {
      console.error(err);
      setError(err.message || t('failedToProcessStatement'));
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  async function openPicker() {
    if (loading) return;
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Images', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'] } }],
          multiple: false,
        });
        processFile(await handle.getFile());
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    fileInputRef.current?.click();
  }

  function updateRow(id, patch) {
    setRows(prev => prev.map(r => (r._id === id ? { ...r, ...patch } : r)));
  }

  function handleGroupChange(id, newGroup) {
    const firstCat = categoriesByGroup[newGroup]?.[0]?.name || 'Uncategorized';
    updateRow(id, { category_group: newGroup, category: firstCat });
  }

  function removeRow(id) {
    setRows(prev => prev.filter(r => r._id !== id));
  }

  const selectedRows = useMemo(() => rows.filter(r => r.selected), [rows]);
  const duplicateCount = useMemo(() => rows.filter(r => r.duplicate).length, [rows]);
  const selectedTotal = useMemo(
    () => selectedRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [selectedRows]
  );
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  function toggleAll() {
    const next = !allSelected;
    setRows(prev => prev.map(r => ({ ...r, selected: next })));
  }

  async function handleSave() {
    if (selectedRows.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const receiptsToInsert = selectedRows.map(r => ({
        user_id: user.id,
        store: r.merchant || null,
        date: new Date(r.date).toISOString(),
        total: parseFloat(parseFloat(r.amount || 0).toFixed(2)),
        currency: r.currency,
        image_url: imageUrl || null,
      }));

      const { data: receipts, error: receiptError } = await supabase
        .from('receipts')
        .insert(receiptsToInsert)
        .select('id');
      if (receiptError) throw receiptError;

      // Supabase preserves insert order, so receipts[i] corresponds to selectedRows[i].
      const itemsToInsert = receipts.map((receipt, i) => {
        const r = selectedRows[i];
        return {
          receipt_id: receipt.id,
          name: r.merchant || t('unknownStore'),
          raw_name: r.raw_description || null,
          price: parseFloat(r.amount) || 0,
          discount: 0,
          quantity: 1,
          category_id: categoryMap[r.category]?.id || null,
        };
      });
      const { error: itemsError } = await supabase.from('items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      navigate('/history', { replace: true });
    } catch (err) {
      setError(err.message || t('failedToSave'));
    } finally {
      setSaving(false);
    }
  }

  if (stage === 'pick') {
    return (
      <div className="scan-page page">
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner" />
            <p>{loadingMsg}</p>
          </div>
        )}
        <div className="scan-content">
          <h2 className="scan-title">{t('importStatementTitle')}</h2>
          <p className="scan-subtitle text-muted">{t('importStatementSubtitle')}</p>

          <button className="btn btn-secondary" style={{ marginTop: '16px' }} onClick={openPicker} disabled={loading}>
            <Image size={18} />
            <span>{t('chooseScreenshot')}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            onChange={handleFileChange}
          />

          <button className="btn btn-ghost" style={{ marginTop: '12px', fontSize: '13px' }} onClick={() => navigate('/')} disabled={loading}>
            <ChevronLeft size={16} />
            {t('backToScan')}
          </button>

          {error && (
            <div className="error-box">
              <p>{error}</p>
              <button className="btn btn-ghost" onClick={() => setError('')}>{t('tryAgain')}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="review-page page">
      <div className="review-header">
        <h2>{t('reviewTransactionsTitle')}</h2>
        {imageUrl && <img src={imageUrl} alt="Statement" className="receipt-thumbnail" />}
      </div>

      <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
        {t('importSummary')
          .replace('{count}', rows.length)
          .replace('{dups}', duplicateCount)}
      </p>

      <div className="import-toolbar">
        <label className="import-checkbox-label">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          <span>{t('selectAll')}</span>
        </label>
        <span className="text-muted" style={{ fontSize: 12 }}>
          {selectedRows.length}/{rows.length}
        </span>
      </div>

      {rows.map(r => (
        <div key={r._id} className={`import-row${r.selected ? '' : ' import-row-off'}`}>
          <div className="import-row-head">
            <input
              type="checkbox"
              checked={r.selected}
              onChange={e => updateRow(r._id, { selected: e.target.checked })}
            />
            <input
              type="text"
              className="form-input import-merchant"
              value={r.merchant}
              onChange={e => updateRow(r._id, { merchant: e.target.value })}
              placeholder={t('storePlaceholder')}
            />
            <input
              type="number"
              className="form-input import-amount"
              value={r.amount}
              onChange={e => updateRow(r._id, { amount: e.target.value })}
              step="0.01"
              min="0"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <select
              className="form-select import-currency"
              value={r.currency}
              onChange={e => updateRow(r._id, { currency: e.target.value })}
            >
              {supportedCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn-icon btn-danger" onClick={() => removeRow(r._id)} aria-label="Remove">
              <Trash2 size={16} />
            </button>
          </div>

          {r.duplicate && (
            <div className={`import-dup-badge import-dup-${r.duplicate.level}`}>
              {r.duplicate.level === 'exact' ? <Copy size={13} /> : <AlertTriangle size={13} />}
              <span>
                {(r.duplicate.level === 'exact' ? t('dupExact') : t('dupNear'))
                  .replace('{store}', r.duplicate.receipt.store || t('unknownStore'))
                  .replace('{date}', new Date(r.duplicate.receipt.date).toLocaleDateString())}
              </span>
              <button className="import-dup-link" onClick={() => navigate(`/receipt/${r.duplicate.receipt.id}`)}>
                {t('viewExisting')}
              </button>
            </div>
          )}
          {!r.is_expense && (
            <div className="import-dup-badge import-dup-income">
              <AlertTriangle size={13} />
              <span>{t('incomingTransaction')}</span>
            </div>
          )}

          <div className="import-row-meta">
            <input
              type="datetime-local"
              className="form-input"
              value={r.date}
              onChange={e => updateRow(r._id, { date: e.target.value, dateInferred: false })}
            />
            {r.dateInferred && (
              <span className="hint-text text-muted" style={{ fontSize: '0.75rem' }}>{t('dateAutoSet')}</span>
            )}
          </div>
          <div className="item-row-bottom">
            <select className="form-select" value={r.category_group} onChange={e => handleGroupChange(r._id, e.target.value)}>
              {groups.map(g => (
                <option key={g.name} value={g.name}>{t('categoryGroups')[g.name] || g.name}</option>
              ))}
            </select>
            <select className="form-select" value={r.category} onChange={e => updateRow(r._id, { category: e.target.value })}>
              {(categoriesByGroup[r.category_group] || []).map(c => (
                <option key={c.name} value={c.name}>{t('categoryNames')[c.name] || c.name}</option>
              ))}
            </select>
          </div>
          {r.raw_description && (
            <div className="text-muted import-raw" title={r.raw_description}>{r.raw_description}</div>
          )}
        </div>
      ))}

      <div className="total-row">
        <span>{t('selectedTotal')}</span>
        <span className="total-amount" style={{ fontFamily: 'var(--font-mono)' }}>
          {selectedTotal.toFixed(2)} {rows[0]?.currency || displayCurrency}
        </span>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="review-actions">
        <button className="btn btn-ghost" onClick={() => navigate('/')}>{t('discard')}</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || selectedRows.length === 0}>
          {saving ? t('saving') : t('saveTransactions').replace('{n}', selectedRows.length)}
        </button>
      </div>
    </div>
  );
}
