/**
 * ChatGPT / madde listesi → gündem maddeleri (AI zorunlu değil).
 */
export type ParsedAgendaDraft = {
  title: string;
  description: string;
};

const BULLET_RE = /^[\s]*(?:[-*•●▪◦]|\d+[.)]|[a-zA-Z][.)]|[ivxlcdm]+[.)])\s+/i;

function stripBullet(line: string): string {
  return String(line || '')
    .replace(BULLET_RE, '')
    .replace(/^[\s]*#{1,6}\s+/, '')
    .trim();
}

/**
 * Numaralı/maddeli metni gündem taslaklarına çevirir.
 * Alt satırlar (bullet olmayan) bir önceki maddenin açıklamasına eklenir.
 */
export function parseAgendaPasteText(raw: string): ParsedAgendaDraft[] {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const items: ParsedAgendaDraft[] = [];
  let current: ParsedAgendaDraft | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current && current.description) current.description += '\n';
      continue;
    }
    const isBullet = BULLET_RE.test(line) || /^\d+\s+/.test(trimmed);
    if (isBullet || (!current && trimmed)) {
      const title = stripBullet(trimmed);
      if (!title) continue;
      current = { title, description: '' };
      items.push(current);
    } else if (current) {
      current.description = current.description
        ? `${current.description}\n${trimmed}`
        : trimmed;
    } else {
      current = { title: trimmed, description: '' };
      items.push(current);
    }
  }

  return items
    .map((it) => ({
      title: it.title.slice(0, 300),
      description: it.description.trim().slice(0, 4000)
    }))
    .filter((it) => it.title.length > 0);
}

export function mergeAgendaDrafts(a: ParsedAgendaDraft, b: ParsedAgendaDraft): ParsedAgendaDraft {
  return {
    title: a.title,
    description: [a.description, b.title, b.description].filter(Boolean).join('\n').trim()
  };
}
