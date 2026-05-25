import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAnimationHtml } from '../../lib/eduPanel/eduPanelApi';

export function useEduAnimationPreview() {
  const [animUrl, setAnimUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const blobRef = useRef<string | null>(null);

  const close = useCallback(() => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setAnimUrl(null);
    setLoading(false);
  }, []);

  const open = useCallback(
    async (animationId: string) => {
      setLoading(true);
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
      setAnimUrl(null);
      try {
        const html = await fetchAnimationHtml(animationId);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setAnimUrl(url);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(
    () => () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    },
    []
  );

  return {
    animUrl,
    loading,
    open,
    close,
    isOpen: loading || Boolean(animUrl)
  };
}
