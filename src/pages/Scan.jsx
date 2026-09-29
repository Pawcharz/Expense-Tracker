import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Image, RefreshCw, Landmark, ClipboardPaste, X, Layers } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { supabase } from '../lib/supabase';
import { parseReceiptImage, getImageChunks, stitchImages } from '../lib/gemini';
import ImageCropper from '../components/ImageCropper';
import { usePasteImage } from '../hooks/usePasteImage';

export default function Scan() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const galleryInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState(null);   // matched existing receipt
  const [pendingNav, setPendingNav] = useState(null);  // navigate args held until user decides
  const [cropFile, setCropFile] = useState(null);      // image awaiting crop before processing
  const [pages, setPages] = useState([]);              // cropped images queued for one receipt

  // Every photo (camera, gallery or clipboard) goes through the crop dialog first.
  function processFile(file) {
    if (!file) return;
    setError('');
    setCropFile(file);
  }

  // Ctrl+V anywhere on this page, or the explicit paste button.
  const { pasteFromClipboard } = usePasteImage(processFile, !loading && !cropFile);
  async function handlePasteClick() {
    if (loading) return;
    const res = await pasteFromClipboard();
    if (!res.ok) setError(t(res.reason === 'no-image' ? 'pasteNoImage' : 'pasteUnsupported'));
  }

  // Queue a cropped page and return to the scan screen for the next photo.
  function addPage(file) {
    setCropFile(null);
    setPages(prev => [...prev, file]);
  }

  function removePage(index) {
    setPages(prev => prev.filter((_, i) => i !== index));
  }

  // Run the pipeline on all queued pages plus the one just cropped (if any).
  function finishWith(file) {
    setCropFile(null);
    const all = file ? [...pages, file] : pages;
    setPages([]);
    runPipeline(all);
  }

  async function runPipeline(files) {
    files = Array.isArray(files) ? files : [files];
    if (files.length === 0) return;
    setLoading(true);
    setError('');

    try {
      // Several photos of one receipt: stitch them for storage and let Gemini
      // OCR each page as its own chunk (the multi-chunk path merges overlaps).
      const file = files.length === 1 ? files[0] : await stitchImages(files);
      const mimeType = file.type || 'image/jpeg';
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

      const [uploadResult, chunkLists] = await Promise.all([
        supabase.storage.from('receipts').upload(fileName, file, { contentType: mimeType }),
        Promise.all(files.map(f => getImageChunks(f))),
      ]);
      const chunks = chunkLists.flat();

      if (uploadResult.error) throw uploadResult.error;

      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);
      const parsedData = await parseReceiptImage(chunks, language);

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
      {cropFile && (
        <ImageCropper
          file={cropFile}
          t={t}
          pageNumber={pages.length + 1}
          onDone={finishWith}
          onAddMore={addPage}
          onSkip={() => finishWith(cropFile)}
          onCancel={() => setCropFile(null)}
        />
      )}
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
        <p className="scan-subtitle text-muted">{pages.length ? t('scanSubtitlePages') : t('scanSubtitle')}</p>

        {pages.length > 0 && (
          <div className="pages-strip">
            <div className="pages-thumbs">
              {pages.map((f, i) => (
                <PageThumb key={i} file={f} index={i} onRemove={() => removePage(i)} />
              ))}
            </div>
            <button className="btn btn-primary btn-full" onClick={() => finishWith(null)} disabled={loading}>
              <Layers size={18} />
              {t('scanPages').replace('{n}', pages.length)}
            </button>
          </div>
        )}

        <label
          className={`btn-camera${loading ? ' btn-disabled' : ''}`}
          style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          <Camera size={40} />
          <span>{pages.length ? t('addPagePhoto') : t('takePhoto')}</span>
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
          className="btn btn-secondary"
          style={{ marginTop: '10px' }}
          onClick={() => navigate('/import')}
          disabled={loading}
        >
          <Landmark size={18} />
          <span>{t('importStatement')}</span>
        </button>

        <button
          className="btn btn-ghost"
          style={{ marginTop: '12px', fontSize: '13px' }}
          onClick={() => navigate('/manual')}
          disabled={loading}
        >
          {t('enterManually')}
        </button>

        <button
          className="btn btn-ghost paste-btn"
          style={{ marginTop: '12px', fontSize: '13px' }}
          onClick={handlePasteClick}
          disabled={loading}
          title={t('pasteHint')}
        >
          <ClipboardPaste size={16} />
          {t('pasteFromClipboard')}
        </button>
        <span className="paste-hint text-muted">{t('pasteHint')}</span>

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

function PageThumb({ file, index, onRemove }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="page-thumb">
      {url && <img src={url} alt="" />}
      <span className="page-thumb-num">{index + 1}</span>
      <button className="page-thumb-remove" onClick={onRemove} aria-label="Remove page"><X size={12} /></button>
    </div>
  );
}
