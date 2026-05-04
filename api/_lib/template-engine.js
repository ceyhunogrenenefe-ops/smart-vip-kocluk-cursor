/**
 * Basit şablon: {{student_name}}, {{lesson_name}}, {{time}}, {{link}}
 * @param {string} content
 * @param {Record<string, string>} vars
 */
export function renderMessageTemplate(content, vars) {
  let out = String(content || '');
  for (const [k, v] of Object.entries(vars || {})) {
    const safe = v == null ? '' : String(v);
    const re = new RegExp(`\\{\\{\\s*${escapeRegExp(k)}\\s*\\}\\}`, 'g');
    out = out.replace(re, safe);
  }
  return out;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
