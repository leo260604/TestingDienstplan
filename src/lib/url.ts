/** URL normalisieren: ohne Schema → https://; nur http(s) mit gültigem Host. '' = leer, null = ungültig */
export function normalizeUrl(raw: string): string | null {
  let u = String(raw || '').trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  try {
    const x = new URL(u);
    if (!['http:', 'https:'].includes(x.protocol)) return null;
    if (!x.hostname || (!x.hostname.includes('.') && x.hostname !== 'localhost')) return null;
    return x.href;
  } catch {
    return null;
  }
}
