import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Image, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { supabase } from '../lib/supabase';
import { parseReceiptImage, imageFileToBase64 } from '../lib/gemini';

export default function Scan() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const galleryInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState(null);   // matched existing receipt
  const [pendingNav, setPendingNav] = useState(null);  // navigate args held until user decides

  async function processFile(file) {
    if (!file) return;
    setLoading(true);
    setError('');

    try {
      const base64 = await imageFileToBase64(file);
      const mimeType = file.type || 'image/jpeg';

      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, file, { contentType: mimeType });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);

      const parsedData = await parseReceiptImage(base64, mimeType, language);

      const navState = { parsedData, imageUrl: publicUrl, imageFile: file };

      // Duplicate detection: same date + total already in DB
      if (parsedData.date && parsedData.total != null) {
        const { data: existing } = await supabase
          .from('receipts')
          .select('id, store, date, total')
          .eq('user_id', user.id)
          .eq('date', parsedData.date)
          .gte('total', parsedData.total - 0.01)
          .lte('total', parsedData.total + 0.01)
          .limit(1);

        if (existing?.length > 0) {
          setDuplicate(existing[0]);
          setPendingNav(navState);
          return;
        }
      }

      navigate('/review', { state: navState });
    } catch (err) {
      console.error(err);
      setError(err.message || t('failedToProcess'));
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  async function openGallery() {
    if (loading) return;
    // File System Access API — Chrome 147+ on Android, no storage permission needed
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Images', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'] } }],
          multiple: false,
        });
        const file = await handle.getFile();
        processFile(file);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled
        // fall through to legacy input
      }
    }
    // Fallback for older Chrome / Android versions
    galleryInputRef.current?.click();
  }

  return (
    <div className="scan-page page">
      {duplicate && (
        <div className="modal-backdrop" onClick={() => setDuplicate(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{t('duplicateTitle')}</h3>
            <p className="modal-body">
              {t('duplicateBody')
                .replace('{store}', duplicate.store || t('unknownStore'))
                .replace('{date}', duplicate.date)
                .replace('{total}', parseFloat(duplicate.total).toFixed(2))}
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => navigate(`/receipt/${duplicate.id}`)}
              >
                {t('viewExisting')}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => { setDuplicate(null); navigate('/review', { state: pendingNav }); }}
              >
                {t('addAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <p>{t('readingReceipt')}</p>
        </div>
      )}

      <div className="scan-content">
        <h2 className="scan-title">{t('scanTitle')}</h2>
        <p className="scan-subtitle text-muted">{t('scanSubtitle')}</p>

        <label
          className={`btn-camera${loading ? ' btn-disabled' : ''}`}
          style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          <Camera size={40} />
          <span>{t('takePhoto')}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            onChange={handleFileChange}
          />
        </label>

        <button
          className="btn btn-secondary"
          style={{ marginTop: '16px' }}
          onClick={openGallery}
          disabled={loading}
        >
          <Image size={18} />
          <span>{t('chooseGallery')}</span>
        </button>
        {/* Fallback input for browsers without showOpenFilePicker */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          onChange={handleFileChange}
        />

        <button
          className="btn btn-ghost"
          style={{ marginTop: '12px', fontSize: '13px' }}
          onClick={() => navigate('/manual')}
          disabled={loading}
        >
          {t('enterManually')}
        </button>

        {error && (
          <div className="error-box">
            <p>{error}</p>
            <p className="text-muted" style={{ fontSize: '12px', marginTop: '6px' }}>
              If no file picker appeared, open Android Settings → Apps → Chrome → Permissions and allow Photos/Files access.
            </p>
            <button
              className="btn btn-ghost"
              onClick={() => setError('')}
            >
              <RefreshCw size={16} />
              {t('tryAgain')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
