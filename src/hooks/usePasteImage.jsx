import { useEffect, useCallback } from 'react';

/**
 * Listen for Ctrl+V / Cmd+V with an image on the clipboard and hand it to
 * `onFile(File)`. Also returns `pasteFromClipboard()` for an explicit button,
 * using the async Clipboard API where available (Chrome/Edge; Safari needs a
 * user gesture, which a button click provides).
 */
export function usePasteImage(onFile, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function onPaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            onFile(nameFile(file));
            return;
          }
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onFile, enabled]);

  const pasteFromClipboard = useCallback(async () => {
    if (!navigator.clipboard?.read) return { ok: false, reason: 'unsupported' };
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          onFile(nameFile(new File([blob], 'clipboard', { type })));
          return { ok: true };
        }
      }
      return { ok: false, reason: 'no-image' };
    } catch (err) {
      return { ok: false, reason: err?.name === 'NotAllowedError' ? 'denied' : 'error' };
    }
  }, [onFile]);

  return { pasteFromClipboard, supported: Boolean(navigator.clipboard?.read) };
}

// Clipboard files arrive as "image.png" with no useful name; give them a
// timestamped one so storage paths stay readable.
function nameFile(file) {
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return new File([file], `clipboard-${stamp}.${ext}`, { type: file.type });
}
