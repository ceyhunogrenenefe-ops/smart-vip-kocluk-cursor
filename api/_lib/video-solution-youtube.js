/** YouTube watch / youtu.be / shorts / embed → video id */

const RAW_ID = /^[a-zA-Z0-9_-]{6,20}$/;

export function parseYoutubeVideoId(ham) {
  const t = String(ham || '').trim();
  if (!t) return null;
  if (RAW_ID.test(t) && !t.includes('/') && !t.includes('.')) return t;
  try {
    let url = t;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return id && RAW_ID.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v');
        return id && RAW_ID.test(id) ? id : null;
      }
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' && parts[1] && RAW_ID.test(parts[1])) return parts[1];
      if (parts[0] === 'embed' && parts[1] && RAW_ID.test(parts[1])) return parts[1];
      if (parts[0] === 'live' && parts[1] && RAW_ID.test(parts[1])) return parts[1];
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeWatchUrl(videoId) {
  const id = String(videoId || '').trim();
  if (!id) return '';
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

export function youtubeNocookieEmbedUrl(videoId) {
  const id = String(videoId || '').trim();
  if (!id) return '';
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
}
