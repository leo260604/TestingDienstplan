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

/** Rücksprungziel nach dem Login: nur Pfade innerhalb der App (auch aus alten, absoluten Links wie https://localhost:3001/…) */
export function safeCallbackPath(raw?: string | null, fallback = '/dashboard'): string {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  let path = s;
  if (!s.startsWith('/')) {
    try {
      const u = new URL(s);
      path = u.pathname + u.search;
    } catch {
      return fallback;
    }
  }
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /^\/(login|api)(\/|\?|$)/.test(path) || path.length > 500) return fallback;
  return path === '/' ? fallback : path;
}
