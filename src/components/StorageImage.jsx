import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  authenticatedStorageObjectUrl,
  directStorageFileUrl
} from '../lib/storageImage';

function clean(value) {
  return String(value ?? '').trim();
}

export default function StorageImage({
  fileId,
  fallbackFileId = '',
  onFinalError,
  ...imgProps
}) {
  const candidates = useMemo(
    () => Array.from(new Set([clean(fileId), clean(fallbackFileId)].filter(Boolean))),
    [fileId, fallbackFileId]
  );

  const [src, setSrc] = useState(() => directStorageFileUrl(candidates[0]));
  const attemptRef = useRef({ index: 0, authenticated: false });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    attemptRef.current = { index: 0, authenticated: false };
    setSrc(directStorageFileUrl(candidates[0]));

    return () => {
      mountedRef.current = false;
    };
  }, [candidates]);

  if (!candidates.length) return null;

  async function recover(event) {
    const attempt = attemptRef.current;
    const currentId = candidates[attempt.index];

    if (currentId && !attempt.authenticated) {
      attempt.authenticated = true;
      try {
        const recovered = await authenticatedStorageObjectUrl(currentId);
        if (mountedRef.current && recovered) {
          setSrc(recovered);
          return;
        }
      } catch {
        // Move to the alternate full/thumbnail ID below.
      }
    }

    const nextIndex = attempt.index + 1;
    if (nextIndex < candidates.length) {
      attemptRef.current = { index: nextIndex, authenticated: false };
      setSrc(directStorageFileUrl(candidates[nextIndex]));
      return;
    }

    onFinalError?.(event);
  }

  return <img {...imgProps} src={src} onError={recover} />;
}
