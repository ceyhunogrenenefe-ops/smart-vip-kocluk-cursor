import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAnimationHtml, fetchPoolAnimationHtml } from '../../lib/eduPanel/eduPanelApi';

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

  const openHtml = useCallback(async (html: string) => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setAnimUrl(null);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    blobRef.current = url;
    setAnimUrl(url);
  }, []);

  const open = useCallback(
    async (animationId: string) => {
      setLoading(true);
      setAnimUrl(null);
      try {
        const html = await fetchAnimationHtml(animationId);
        await openHtml(html);
      } finally {
        setLoading(false);
      }
    },
    [openHtml]
  );

  const openPool = useCallback(
    async (poolId: string) => {
      setLoading(true);
      setAnimUrl(null);
      try {
        const html = await fetchPoolAnimationHtml(poolId);
        await openHtml(html);
      } finally {
        setLoading(false);
      }
    },
    [openHtml]
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
    openPool,
    close,
    isOpen: loading || Boolean(animUrl)
  };
}
