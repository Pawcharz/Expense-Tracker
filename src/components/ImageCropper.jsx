import { useEffect, useRef, useState, useCallback } from 'react';
import { RotateCw, Check, X, Maximize2, Plus } from 'lucide-react';

const HANDLE_HIT = 28;   // px radius around a corner/edge that grabs it
const MIN_SIZE = 40;     // px, in displayed coordinates

/**
 * Full-screen crop dialog. Works with mouse and touch via pointer events.
 * `file` is the original image; `onDone(File)` receives the cropped JPEG,
 * `onSkip()` keeps the original, `onCancel()` aborts.
 */
export default function ImageCropper({ file, onDone, onAddMore, onSkip, onCancel, t, pageNumber }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [src, setSrc] = useState(null);         // object URL of the (possibly rotated) source
  const [natural, setNatural] = useState(null); // { w, h } of the source
  const [box, setBox] = useState(null);         // displayed image rect inside the container
  const [crop, setCrop] = useState(null);       // { x, y, w, h } in displayed px, relative to box
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);

  // Load the file into an object URL.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Measure how the image is laid out (object-fit: contain) and reset the crop.
  const layout = useCallback(() => {
    const img = imgRef.current;
    const el = containerRef.current;
    if (!img || !el || !img.naturalWidth) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const x = (cw - w) / 2, y = (ch - h) / 2;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    setBox({ x, y, w, h, scale });
    setCrop(prev => {
      // Keep relative crop across resizes; otherwise start with a small inset.
      if (prev && prev._rel) {
        return { x: prev._rel.x * w, y: prev._rel.y * h, w: prev._rel.w * w, h: prev._rel.h * h, _rel: prev._rel };
      }
      const inset = 0.04;
      const c = { x: w * inset, y: h * inset, w: w * (1 - 2 * inset), h: h * (1 - 2 * inset) };
      return { ...c, _rel: { x: inset, y: inset, w: 1 - 2 * inset, h: 1 - 2 * inset } };
    });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', layout);
    return () => window.removeEventListener('resize', layout);
  }, [layout]);

  function withRel(c) {
    if (!box) return c;
    return { ...c, _rel: { x: c.x / box.w, y: c.y / box.h, w: c.w / box.w, h: c.h / box.h } };
  }

  // Which part of the crop rectangle is under (px, py)? px/py relative to box.
  function hitTest(px, py) {
    if (!crop) return null;
    const near = (a, b) => Math.abs(a - b) <= HANDLE_HIT;
    const L = crop.x, R = crop.x + crop.w, T = crop.y, B = crop.y + crop.h;
    const onL = near(px, L), onR = near(px, R), onT = near(py, T), onB = near(py, B);
    const insideX = px > L - HANDLE_HIT && px < R + HANDLE_HIT;
    const insideY = py > T - HANDLE_HIT && py < B + HANDLE_HIT;
    if (onL && onT) return 'nw';
    if (onR && onT) return 'ne';
    if (onL && onB) return 'sw';
    if (onR && onB) return 'se';
    if (onT && insideX) return 'n';
    if (onB && insideX) return 's';
    if (onL && insideY) return 'w';
    if (onR && insideY) return 'e';
    if (px > L && px < R && py > T && py < B) return 'move';
    return null;
  }

  function toBoxCoords(e) {
    const rect = containerRef.current.getBoundingClientRect();
    return { px: e.clientX - rect.left - box.x, py: e.clientY - rect.top - box.y };
  }

  function onPointerDown(e) {
    if (!box || !crop) return;
    const { px, py } = toBoxCoords(e);
    const mode = hitTest(px, py);
    if (!mode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, startX: px, startY: py, start: { ...crop } };
    e.preventDefault();
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d || !box) return;
    const { px, py } = toBoxCoords(e);
    const dx = px - d.startX, dy = py - d.startY;
    const s = d.start;
    let { x, y, w, h } = s;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

    if (d.mode === 'move') {
      x = clamp(s.x + dx, 0, box.w - s.w);
      y = clamp(s.y + dy, 0, box.h - s.h);
    } else {
      if (d.mode.includes('w')) { const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_SIZE); w = s.w + (s.x - nx); x = nx; }
      if (d.mode.includes('e')) { w = clamp(s.w + dx, MIN_SIZE, box.w - s.x); }
      if (d.mode.includes('n')) { const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_SIZE); h = s.h + (s.y - ny); y = ny; }
      if (d.mode.includes('s')) { h = clamp(s.h + dy, MIN_SIZE, box.h - s.y); }
    }
    setCrop(withRel({ x, y, w, h }));
  }

  function onPointerUp(e) {
    if (drag.current) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
      drag.current = null;
    }
  }

  function resetCrop() {
    if (!box) return;
    setCrop(withRel({ x: 0, y: 0, w: box.w, h: box.h }));
  }

  // Rotate the source 90° clockwise by re-encoding it, then re-layout.
  async function rotate() {
    const img = imgRef.current;
    if (!img?.naturalWidth) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));
      const url = URL.createObjectURL(blob);
      setCrop(null);
      setSrc(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
    } finally {
      setBusy(false);
    }
  }

  async function cropToFile() {
    const img = imgRef.current;
    if (!img || !box || !crop || !natural) return null;
    setBusy(true);
    try {
      const sx = Math.round(crop.x / box.scale);
      const sy = Math.round(crop.y / box.scale);
      const sw = Math.round(crop.w / box.scale);
      const sh = Math.round(crop.h / box.scale);
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
      const name = (file.name || 'receipt').replace(/\.[^.]+$/, '') + '.jpg';
      return new File([blob], name, { type: 'image/jpeg' });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    const f = await cropToFile();
    if (f) onDone(f);
  }

  async function addMore() {
    const f = await cropToFile();
    if (f) onAddMore(f);
  }

  const cursorFor = mode => ({
    nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
    n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move',
  }[mode] || 'default');

  function onPointerHover(e) {
    if (drag.current || !box) return;
    const { px, py } = toBoxCoords(e);
    e.currentTarget.style.cursor = cursorFor(hitTest(px, py));
  }

  return (
    <div className="cropper">
      <div className="cropper-top">
        <button className="btn-icon" onClick={onCancel} aria-label={t('cancel')}><X size={22} /></button>
        <span className="cropper-title">{t('cropTitle')}{pageNumber > 1 ? ` · ${t('pageN').replace('{n}', pageNumber)}` : ''}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn-icon" onClick={resetCrop} title={t('cropReset')} aria-label={t('cropReset')}><Maximize2 size={20} /></button>
          <button className="btn-icon" onClick={rotate} disabled={busy} title={t('cropRotate')} aria-label={t('cropRotate')}><RotateCw size={20} /></button>
        </div>
      </div>

      <div
        className="cropper-stage"
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={e => { onPointerMove(e); onPointerHover(e); }}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {src && (
          <img
            ref={imgRef}
            src={src}
            alt=""
            className="cropper-img"
            draggable={false}
            onLoad={layout}
          />
        )}
        {box && crop && (
          <>
            {/* Dim everything outside the crop */}
            <div className="cropper-shade" style={{ left: box.x, top: box.y, width: box.w, height: crop.y }} />
            <div className="cropper-shade" style={{ left: box.x, top: box.y + crop.y + crop.h, width: box.w, height: box.h - crop.y - crop.h }} />
            <div className="cropper-shade" style={{ left: box.x, top: box.y + crop.y, width: crop.x, height: crop.h }} />
            <div className="cropper-shade" style={{ left: box.x + crop.x + crop.w, top: box.y + crop.y, width: box.w - crop.x - crop.w, height: crop.h }} />
            <div className="cropper-rect" style={{ left: box.x + crop.x, top: box.y + crop.y, width: crop.w, height: crop.h }}>
              <span className="cropper-handle nw" /><span className="cropper-handle ne" />
              <span className="cropper-handle sw" /><span className="cropper-handle se" />
            </div>
          </>
        )}
      </div>

      <p className="cropper-hint text-muted">{t('cropHint')}</p>

      <div className="cropper-actions">
        <button className="btn btn-ghost" onClick={onSkip} disabled={busy}>{t('cropSkip')}</button>
        {onAddMore && (
          <button className="btn btn-secondary" onClick={addMore} disabled={busy || !crop} title={t('cropAddMoreHint')}>
            <Plus size={18} />
            {t('cropAddMore')}
          </button>
        )}
        <button className="btn btn-primary" onClick={confirm} disabled={busy || !crop}>
          <Check size={18} />
          {pageNumber > 1 ? t('cropUseAll').replace('{n}', pageNumber) : t('cropUse')}
        </button>
      </div>
    </div>
  );
}
