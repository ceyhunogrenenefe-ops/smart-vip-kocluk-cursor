/**
 * Gündem metni ayrıştırma — sunucu tarafı (AI yok).
 */
export function parseAgendaPasteText(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const BULLET_RE = /^[\s]*(?:[-*•●▪◦]|\d+[.)]|[a-zA-Z][.)]|[ivxlcdm]+[.)])\s+/i;
  const stripBullet = (line) =>
    String(line || '')
      .replace(BULLET_RE, '')
      .replace(/^[\s]*#{1,6}\s+/, '')
      .trim();

  const lines = text.split('\n');
  const items = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current?.description) current.description += '\n';
      continue;
    }
    const isBullet = BULLET_RE.test(line) || /^\d+\s+/.test(trimmed);
    if (isBullet || (!current && trimmed)) {
      const title = stripBullet(trimmed);
      if (!title) continue;
      current = { title, description: '' };
      items.push(current);
    } else if (current) {
      current.description = current.description ? `${current.description}\n${trimmed}` : trimmed;
    } else {
      current = { title: trimmed, description: '' };
      items.push(current);
    }
  }
  return items
    .map((it) => ({
      title: String(it.title || '').slice(0, 300),
      description: String(it.description || '').trim().slice(0, 4000)
    }))
    .filter((it) => it.title);
}
