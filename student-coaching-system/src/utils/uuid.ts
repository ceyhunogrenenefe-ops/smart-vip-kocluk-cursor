/** Postgres UUID (RFC4122) — `inst-...` ve `default` gibi değerleri eler */
export function isUuid(value: unknown): boolean {
  const s = value == null ? '' : String(value).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
