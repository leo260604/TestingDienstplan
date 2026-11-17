/* Eindeutige Teamfarben: jede Farbe nur einmal, zu ähnliche Farben werden deutlich abgeändert (ΔE CIE76) */
import { STANDBY_COLORS } from './entries';

export const TEAM_PALETTE = ['#14A1A9', '#0068A8', '#2f8f5b', '#d4880f', '#c2412d', '#8a4fbf', '#d0508a', '#596579', '#1f3f7a', '#7b8f32'];
export const TC_MIN_DIFF = 22;

const hexRgb = (h: string) => {
  h = String(h || '').replace('#', '');
  return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)) : null;
};
function lab(hex: string) {
  const c = hexRgb(hex);
  if (!c) return null;
  const l = c.map((v) => {
    v /= 255;
    return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
  });
  const x = (l[0] * 0.4124 + l[1] * 0.3576 + l[2] * 0.1805) / 0.95047,
    y = l[0] * 0.2126 + l[1] * 0.7152 + l[2] * 0.0722,
    z = (l[0] * 0.0193 + l[1] * 0.1192 + l[2] * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
export function colorDiff(a: string, b: string) {
  const A = lab(a),
    B = lab(b);
  if (!A || !B) return 999;
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}
function hsl(hex: string): [number, number, number] {
  const [r, g, b] = hexRgb(hex)!.map((v) => v / 255);
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2;
  let h = 0,
    s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
export function fromHsl(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + h / 30) % 12,
    a = s * Math.min(l, 1 - l),
    f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

type ColoredTeam = { id: string; color: string; name?: string };

export function colorClash(c: string, others: ColoredTeam[], exceptId?: string | null) {
  let best: ColoredTeam | null = null,
    bd = 999;
  others.forEach((t) => {
    if (t.id === exceptId) return;
    const d = colorDiff(c, t.color);
    if (d < bd) {
      bd = d;
      best = t;
    }
  });
  return bd < TC_MIN_DIFF ? best : null;
}

/** c unverändert, wenn deutlich verschieden – sonst die kleinste Abwandlung im gleichen Farbton */
export function distinctTeamColor(c: string, others: ColoredTeam[], exceptId?: string | null): string {
  if (!hexRgb(c)) c = '#14a1a9';
  c = c.toLowerCase();
  if (!colorClash(c, others, exceptId)) return c;
  const [h, s0, l0] = hsl(c);
  let best: string | null = null,
    bd = 1e9;
  for (let dl = -0.42; dl <= 0.42001; dl += 0.02)
    for (const ds of [0, 0.12, -0.12, 0.25, -0.25])
      for (const dh of [0, -6, 6]) {
        const l = l0 + dl,
          sat = Math.max(0, Math.min(1, s0 + ds));
        if (l < 0.14 || l > 0.86) continue;
        const x = fromHsl(h + dh, sat, l);
        if (colorClash(x, others, exceptId)) continue;
        const d = colorDiff(x, c) + Math.abs(dh) * 0.8 + Math.abs(ds) * 10;
        if (d < bd) {
          bd = d;
          best = x;
        }
      }
  if (best) return best;
  for (let step = 1; step < 12; step++)
    for (const dir of [1, -1]) {
      const x = fromHsl(h + dir * step * 30, Math.max(0.45, s0), Math.max(0.32, Math.min(0.55, l0)));
      if (!colorClash(x, others, exceptId)) return x;
    }
  return TEAM_PALETTE.map((x) => x.toLowerCase()).find((x) => !colorClash(x, others, exceptId)) || c;
}

/** Freie Farbvorschläge: deutlich verschieden von allen Teams und voneinander */
export function freeTeamColors(others: ColoredTeam[], exceptId?: string | null, max = 10): string[] {
  const pool = [...TEAM_PALETTE, ...STANDBY_COLORS];
  for (const l of [0.45, 0.36, 0.54]) for (let h = 0; h < 360; h += 20) pool.push(fromHsl(h, 0.62, l));
  const out: string[] = [];
  for (const c of pool) {
    const x = c.toLowerCase();
    if (colorClash(x, others, exceptId)) continue;
    if (out.some((o) => colorDiff(o, x) < TC_MIN_DIFF)) continue;
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}
