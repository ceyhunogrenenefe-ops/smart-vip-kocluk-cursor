import { budgetedTranscribe, juniorVipOpenAiKey } from './junior-vip-openai.js';

/** Junior VIP ses kaydı üst sınırı (≈ 1 MB ≈ 4 dk opus). Daha büyük kayıt bütçe ayırmasını gereksiz şişirir. */
const MAX_BYTES = 1024 * 1024;

function extForMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'webm';
}

/** Öğrenci ses kaydı → metin (masaüstü yedek yolu). Ücretli çağrı bütçe kontrolünden geçer. */
export async function juniorVipTranscribeFromBase64({ audio_base64, mime, panel = null }) {
  if (!juniorVipOpenAiKey()) {
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
  return budgetedTranscribe({ buf, mime: type, name: `junior-vip.${extForMime(type)}`, panel });
}
