/**
 * CRM gelen kutusu giden eki.
 *
 * İstek gövdesi Vercel'de yaklaşık 4,5 MB ile sınırlı; base64 bunu ~4/3 şişirir.
 * Ham dosya bu yüzden 2,5 MB'da kesilir. Fotoğraf PNG veya JPG, dosya ise
 * PDF / Office / düz metindir. Tür, uzantıya değil dosyanın başına bakılarak doğrulanır.
 */

export const CRM_MEDIA_MAX_BYTES = 2_621_440;

const EXT_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv'
};

const OPENXML = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

const OLE = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint'
]);

export function safeCrmFilename(name, fallback = 'dosya') {
  const base = String(name || '')
    .split(/[/\\]/)
    .pop()
    .replace(/[^\p{L}\p{N}.\-() ]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^[.\s_]+/, '')
    .slice(0, 80);
  return base || fallback;
}

function extOf(filename) {
  const m = String(filename || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return m ? m[1] : '';
}

export function sniffCrmImageMime(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return '';
}

function startsWith(buffer, ascii) {
  return buffer.length >= ascii.length && buffer.subarray(0, ascii.length).toString('ascii') === ascii;
}

function isOle(buffer) {
  return buffer.length >= 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
}

function looksLikeText(buffer) {
  const head = buffer.subarray(0, Math.min(buffer.length, 1024));
  if (head.includes(0)) return false;
  if (head[0] === 0x4d && head[1] === 0x5a) return false;
  return true;
}

/**
 * @param {{ buffer: Buffer, mimeType?: string, filename?: string, maxBytes?: number }} input
 */
export function classifyCrmMediaBuffer({ buffer, mimeType, filename, maxBytes = CRM_MEDIA_MAX_BYTES }) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) {
    const err = new Error('Dosya boş.');
    err.code = 'MEDIA';
    throw err;
  }
  if (buf.length > maxBytes) {
    const err = new Error('Dosya en fazla 2,5 MB olabilir.');
    err.code = 'MEDIA';
    throw err;
  }

  const claimed = String(mimeType || '')
    .toLowerCase()
    .split(';')[0]
    .trim()
    .replace('image/jpg', 'image/jpeg');
  const ext = extOf(filename);
  const fromExt = EXT_MIME[ext] || '';
  const sniffed = sniffCrmImageMime(buf);

  let mime = sniffed || (EXT_MIME[ext] ? fromExt : claimed);
  if (sniffed) mime = sniffed;
  else if (fromExt && (!claimed || claimed === 'application/octet-stream')) mime = fromExt;
  else if (claimed && EXT_MIME[ext] === claimed) mime = claimed;
  else if (fromExt) mime = fromExt;
  else mime = claimed;

  if (sniffed) {
    const extWanted = sniffed === 'image/png' ? 'png' : 'jpg';
    const name = safeCrmFilename(filename, `fotograf.${extWanted}`);
    const withExt = name.toLowerCase().endsWith(`.${extWanted}`) || (extWanted === 'jpg' && name.toLowerCase().endsWith('.jpeg'))
      ? name
      : `${name.replace(/\.[^.]+$/, '')}.${extWanted}`;
    return { kind: 'image', mime: sniffed, filename: safeCrmFilename(withExt, `fotograf.${extWanted}`), size: buf.length };
  }

  if (mime === 'application/pdf') {
    if (!startsWith(buf, '%PDF')) throw mediaError('Bu dosya PDF değil.');
    return finishDoc(buf, mime, filename, 'belge.pdf');
  }
  if (OPENXML.has(mime)) {
    if (!startsWith(buf, 'PK')) throw mediaError('Bu dosya seçilen Office belgesi değil.');
    return finishDoc(buf, mime, filename, 'belge');
  }
  if (OLE.has(mime)) {
    if (!isOle(buf)) throw mediaError('Bu dosya seçilen Office belgesi değil.');
    return finishDoc(buf, mime, filename, 'belge');
  }
  if (mime === 'text/plain' || mime === 'text/csv') {
    if (!looksLikeText(buf)) throw mediaError('Bu dosya düz metin değil.');
    const wire = 'text/plain';
    return finishDoc(buf, wire, filename, mime === 'text/csv' ? 'tablo.csv' : 'not.txt');
  }

  throw mediaError('PNG, JPG, PDF, Word, Excel, PowerPoint veya metin dosyası seçin.');
}

function finishDoc(buf, mime, filename, fallback) {
  return { kind: 'document', mime, filename: safeCrmFilename(filename, fallback), size: buf.length };
}

function mediaError(message) {
  const err = new Error(message);
  err.code = 'MEDIA';
  return err;
}

/**
 * @param {{ dataBase64?: string, mimeType?: string, filename?: string, maxBytes?: number }} input
 */
export function prepareCrmOutboundMedia({ dataBase64, mimeType, filename, maxBytes } = {}) {
  let raw = String(dataBase64 || '').trim();
  const comma = raw.indexOf(',');
  if (/^data:/i.test(raw) && comma >= 0) raw = raw.slice(comma + 1);
  raw = raw.replace(/\s/g, '');
  if (!raw) throw mediaError('Dosya boş.');
  if (raw.length > 3_600_000) throw mediaError('Dosya en fazla 2,5 MB olabilir.');
  const buffer = Buffer.from(raw, 'base64');
  const classified = classifyCrmMediaBuffer({ buffer, mimeType, filename, maxBytes });
  return { ...classified, buffer };
}
