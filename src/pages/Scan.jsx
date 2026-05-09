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
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
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

        <button
          className="btn-camera"
          onClick={() => cameraInputRef.current?.click()}
          disabled={loading}
        >
          <Camera size={40} />
          <span>{t('takePhoto')}</span>
        </button>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <button
          className="btn btn-secondary"
          style={{ marginTop: '16px' }}
          onClick={() => galleryInputRef.current?.click()}
          disabled={loading}
        >
          <Image size={18} />
          <span>{t('chooseGallery')}</span>
        </button>

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
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
