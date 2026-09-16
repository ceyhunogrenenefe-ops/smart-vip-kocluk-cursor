/**
 * Meta'da onaylı şablon gövdesi ile message_templates satırını hizalama.
 * DB metni değişip Meta şablonu eski kaldığında (#132000 parametre sayısı uyuşmazlığı)
 * gerçek gövdeden değişken sırası çıkarılır.
 */

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

export function templatePlaceholders(text) {
  return [...String(text || '').matchAll(PLACEHOLDER)].map((m) => m[1].trim());
}

/** Değişkenler çıkarılmış, boşlukları sadeleştirilmiş gövde — iki metnin aynı şablon olup olmadığını anlamak için */
export function templateSkeleton(text) {
  return String(text || '')
    .replace(PLACEHOLDER, '{{}}')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

/**
 * @param {string} metaBody Meta BODY metni ({{1}} veya {{ad}})
 * @param {string[]} candidates Bilinen metinler ({{student_name}} gibi adlı) — pozisyonel eşleme için
 * @returns {{ content: string, variables: string[], named: boolean } | null}
 */
export function resolveBindingFromMetaBody(metaBody, candidates = []) {
  const body = String(metaBody || '');
  const tokens = templatePlaceholders(body);
  if (!tokens.length) return { content: body, variables: [], named: false };

  const positional = tokens.every((t) => /^\d+$/.test(t));
  if (!positional) {
    return { content: body, variables: [...new Set(tokens)], named: true };
  }

  const skeleton = templateSkeleton(body);
  for (const candidate of candidates) {
    if (!candidate || templateSkeleton(candidate) !== skeleton) continue;
    const names = templatePlaceholders(candidate);
    if (names.length !== tokens.length) continue;
    const byIndex = {};
    tokens.forEach((t, i) => {
      byIndex[t] = names[i];
    });
    const max = Math.max(...tokens.map(Number));
    const variables = Array.from({ length: max }, (_, i) => byIndex[String(i + 1)]);
    if (variables.some((v) => !v)) continue;
    const content = body.replace(PLACEHOLDER, (_, t) => `{{${byIndex[t.trim()]}}}`);
    return { content, variables, named: false };
  }
  return null;
}

export function isParameterCountMismatch(result) {
  const code = String(result?.errorCode || '');
  const msg = String(result?.error || '');
  return code === '132000' || /#132000|number of parameters does not match/i.test(msg);
}
