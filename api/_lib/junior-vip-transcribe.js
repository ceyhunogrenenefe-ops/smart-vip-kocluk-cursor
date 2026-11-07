const MAX_BYTES = 4 * 1024 * 1024;

function openAiKey() {
  return (process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY || '').trim();
}

function extForMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'webm';
}

/** Öğrenci ses kaydı → Whisper (masaüstü Chrome yedek yolu). */
export async function juniorVipTranscribeFromBase64({ audio_base64, mime }) {
  const key = openAiKey();
  if (!key) {
    const err = new Error('transcribe_unavailable');
    err.code = 'transcribe_unavailable';
    throw err;
  }

  const b64 = String(audio_base64 || '').trim();
  if (!b64) {
    const err = new Error('audio_missing');
    err.code = 'audio_missing';
    throw err;
  }

  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 200) {
    const err = new Error('audio_too_short');
    err.code = 'audio_too_short';
    throw err;
  }
  if (buf.length > MAX_BYTES) {
    const err = new Error('audio_too_large');
    err.code = 'audio_too_large';
    throw err;
  }

  const type = String(mime || 'audio/webm').trim() || 'audio/webm';
  const name = `junior-vip.${extForMime(type)}`;
  const blob = new Blob([buf], { type });

  const form = new FormData();
  form.append('file', blob, name);
  form.append('model', 'whisper-1');
  form.append('language', 'tr');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error?.message || `whisper_${res.status}`;
    const err = new Error(msg);
    err.code = 'whisper_failed';
    throw err;
  }

  return String(payload?.text || '').trim();
}
