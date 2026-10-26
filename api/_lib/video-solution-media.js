import {
  parseYoutubeVideoId,
  youtubeNocookieEmbedUrl,
  youtubeWatchUrl
} from './video-solution-youtube.js';

export const VIDEO_PROVIDERS = new Set(['youtube', 'vimeo', 'google_drive', 'external']);

export const VIDEO_PROVIDER_LABELS = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  google_drive: 'Google Drive',
  external: 'Bağlantı'
};

function parseHttpUrl(ham) {
  const t = String(ham || '').trim();
  if (!t) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

export function parseGoogleDriveFileId(url) {
  const path = url.pathname || '';
  const m = path.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m?.[1]) return m[1];
  const openId = url.searchParams.get('id');
  if (openId && /^[a-zA-Z0-9_-]+$/.test(openId)) return openId;
  return null;
}

export function parseVimeoId(url) {
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'vimeo.com') {
    const id = parts[0] === 'video' ? parts[1] : parts[0];
    if (id && /^\d+$/.test(id)) return id;
  }
  if (host === 'player.vimeo.com' && parts[0] === 'video' && /^\d+$/.test(parts[1] || '')) {
    return parts[1];
  }
  return null;
}

/**
 * YouTube, Vimeo, Google Drive veya genel https bağlantısı.
 * @returns {{ provider: string, ref: string, source_url: string } | null}
 */
export function parseVideoSource(ham) {
  const t = String(ham || '').trim();
  if (!t) return null;

  const ytId = parseYoutubeVideoId(t);
  if (ytId) {
    return { provider: 'youtube', ref: ytId, source_url: youtubeWatchUrl(ytId) };
  }

  const url = parseHttpUrl(t);
  if (!url) return null;

  const host = url.hostname.replace(/^www\./i, '').toLowerCase();

  if (host === 'drive.google.com' || host === 'docs.google.com') {
    const fileId = parseGoogleDriveFileId(url);
    if (fileId) {
      return {
        provider: 'google_drive',
        ref: fileId,
        source_url: `https://drive.google.com/file/d/${fileId}/view`
      };
    }
  }

  const vimeoId = parseVimeoId(url);
  if (vimeoId) {
    return {
      provider: 'vimeo',
      ref: vimeoId,
      source_url: `https://vimeo.com/${vimeoId}`
    };
  }

  return { provider: 'external', ref: url.toString(), source_url: url.toString() };
}

export function buildVideoEmbedUrl(provider, ref) {
  const p = String(provider || 'youtube').trim();
  const r = String(ref || '').trim();
  if (!r) return null;
  if (p === 'youtube') return youtubeNocookieEmbedUrl(r);
  if (p === 'vimeo') return `https://player.vimeo.com/video/${encodeURIComponent(r)}`;
  if (p === 'google_drive') {
    return `https://drive.google.com/file/d/${encodeURIComponent(r)}/preview`;
  }
  return null;
}

/** DB satırından API / public alanları */
export function videoMediaFromRow(row) {
  if (!row) return null;
  const provider = VIDEO_PROVIDERS.has(row.video_provider) ? row.video_provider : 'youtube';
  const ref =
    String(row.video_ref || '').trim() ||
    (provider === 'youtube' ? String(row.youtube_video_id || '').trim() : '') ||
    String(row.youtube_url || '').trim();
  const source_url =
    String(row.youtube_url || '').trim() ||
    (provider === 'youtube' && ref ? youtubeWatchUrl(ref) : ref) ||
    null;

  return {
    video_provider: provider,
    video_ref: ref,
    source_url,
    embed_url: buildVideoEmbedUrl(provider, provider === 'external' ? null : ref),
    provider_label: VIDEO_PROVIDER_LABELS[provider] || provider,
    /** Geriye dönük alanlar */
    youtube_video_id: provider === 'youtube' ? ref : row.youtube_video_id || null,
    youtube_url: source_url
  };
}
