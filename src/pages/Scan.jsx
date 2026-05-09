import { useState } from 'react';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

      navigate('/review', {
        state: { parsedData, imageUrl: publicUrl, imageFile: file },
      });
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

  return (
    <div className="scan-page page">
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
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            onChange={handleFileChange}
          />
        </label>

        <label
          className={`btn btn-secondary${loading ? ' btn-disabled' : ''}`}
          style={{ marginTop: '16px', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          <Image size={18} />
          <span>{t('chooseGallery')}</span>
          <input
            type="file"
            accept="image/*"
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            onChange={handleFileChange}
          />
        </label>

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
