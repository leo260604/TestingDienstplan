'use client';
/* Eigene Datumsauswahl (Tag, Woche, Monat) und eigener Farbwähler – wie in der bisherigen Browser-Version.
   Ersetzt die Browser-eigenen Auswahlfelder (<input type="date"> / <input type="color">). */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { addDays, day, isoDate, isoWeek, MONTHS_DE, WD_SHORT } from '@/lib/dates';
import { holidayName } from '@/lib/holidays';
import { useApp } from '../AppProvider';
import { Icon } from './index';

const MON_SHORT = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const mondayOf = (iso: string) => {
  const d = day(iso);
  return isoDate(addDays(d, -((d.getDay() + 6) % 7)));
};

/** Positioniert ein Popup unter (oder über) dem Auslöser und hält es beim Scrollen dort */
function usePlace(anchor: HTMLElement | null, pop: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  const place = useCallback(() => {
    const el = pop.current;
    if (!anchor || !el) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const x = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    let y = r.bottom + 6;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }, [anchor, pop]);
  useLayoutEffect(() => {
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, ...deps]);
  useEffect(() => {
    const onScroll = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) place();
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, [place, pop]);
}

/** Schließt bei Klick daneben, Esc oder Größenänderung */
function useDismiss(pop: React.RefObject<HTMLDivElement | null>, anchor: HTMLElement | null, close: () => void) {
  useEffect(() => {
    const outside = (e: Event) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || anchor?.contains(t)) return;
      close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        close();
        anchor?.focus({ preventScroll: true });
      }
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', outside, true);
      document.addEventListener('touchstart', outside, true);
      document.addEventListener('keydown', key, true);
      window.addEventListener('resize', close);
    });
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('touchstart', outside, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', close);
    };
  }, [pop, anchor, close]);
}

function useShow() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return show;
}

export interface DayPickerProps {
  anchor: HTMLElement | null;
  value: string;
  onPick: (iso: string) => void;
  onClose: () => void;
  /** Wochenauswahl: ganze KW wird markiert, zurückgegeben wird der Montag */
  week?: boolean;
  min?: string;
  max?: string;
  allowed?: (iso: string) => boolean;
  /** Zeitraum markieren (Von–Bis) */
  rangeFrom?: string;
  rangeTo?: string;
  /** „Entfernen“ anbieten */
  clearable?: boolean;
}

/** Kalender-Popup: Monat mit KW, Feiertagen, heute, Zeitraum */
export function DayPickerPop({ anchor, value, onPick, onClose, week, min, max, allowed, rangeFrom, rangeTo, clearable }: DayPickerProps) {
  const base = value ? day(value) : new Date();
  const [ym, setYm] = useState(() => new Date(base.getFullYear(), base.getMonth(), 1, 12));
  const ref = useRef<HTMLDivElement>(null);
  const show = useShow();
  usePlace(anchor, ref, [ym]);
  useDismiss(ref, anchor, onClose);
  const today = isoDate(new Date());
  const ok = (iso: string) => (!min || iso >= min) && (!max || iso <= max) && (!allowed || allowed(iso));
  const pick = (iso: string) => {
    onClose();
    onPick(week && iso ? mondayOf(iso) : iso);
    setTimeout(() => anchor?.focus({ preventScroll: true }));
  };
  useEffect(() => {
    const t = setTimeout(() => (ref.current?.querySelector<HTMLElement>('.dpk-day.on') || ref.current?.querySelector<HTMLElement>('.dpk-day.today') || ref.current?.querySelector<HTMLElement>('button.dpk-day'))?.focus({ preventScroll: true }), 30);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 20) return;
      e.preventDefault();
      setYm((m) => new Date(m.getFullYear(), m.getMonth() + (e.deltaY > 0 ? 1 : -1), 1, 12));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const y = ym.getFullYear(),
    m = ym.getMonth();
  const lead = (new Date(y, m, 1, 12).getDay() + 6) % 7;
  const start = addDays(new Date(y, m, 1, 12), -lead);
  const weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7);
  let rs = '',
    re = '';
  if (week && value) {
    rs = mondayOf(value);
    re = isoDate(addDays(day(rs), 6));
  } else if (rangeFrom && rangeTo && rangeTo >= rangeFrom) {
    rs = rangeFrom;
    re = rangeTo;
  }
  const rows = [];
  for (let w = 0; w < weeks; w++) {
    const wStart = addDays(start, w * 7);
    const wIso = isoDate(wStart);
    const kw = isoWeek(wStart);
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, w * 7 + i),
        iso = isoDate(d),
        hol = holidayName(iso);
      const cls = ['dpk-day', d.getMonth() !== m && 'out', i >= 5 && 'we', iso === today && 'today', !week && iso === value && 'on', hol && 'hol', rs && iso >= rs && iso <= re && 'rng', iso === rs && rs !== re && 'rs', iso === re && rs !== re && 're']
        .filter(Boolean)
        .join(' ');
      const tip = [hol, iso === today ? 'Heute' : ''].filter(Boolean).join(' · ');
      cells.push(
        ok(iso) ? (
          <button key={iso} type="button" className={cls} title={tip || undefined} aria-label={d.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (hol ? ' – ' + hol : '')} aria-pressed={iso === value || undefined} onClick={(e) => { e.stopPropagation(); pick(iso); }}>
            <span>{d.getDate()}</span>
          </button>
        ) : (
          <span key={iso} className={cls + ' off'} aria-hidden="true" title={hol || undefined}>
            <span>{d.getDate()}</span>
          </span>
        ),
      );
    }
    rows.push(
      <div key={wIso} className={`dpk-row${week && wIso === rs ? ' sel' : ''}`}>
        {week ? (
          <button type="button" className="dpk-kw" aria-label={`KW ${kw} auswählen`} onClick={(e) => { e.stopPropagation(); pick(wIso); }}>
            <span>{kw}</span>
          </button>
        ) : (
          <span className="dpk-kw">{kw}</span>
        )}
        {cells}
      </div>,
    );
  }
  return createPortal(
    <div ref={ref} className={`dpk-pop${week ? ' dpk-week' : ''}${show ? ' show' : ''}`} role="dialog" aria-label="Datum auswählen" onClick={(e) => e.stopPropagation()}>
      <div className="dpk-head">
        <button type="button" className="dpk-nav" aria-label="Vorheriger Monat" onClick={() => setYm(new Date(y, m - 1, 1, 12))}>
          <Icon name="chev" />
        </button>
        <div className="dpk-title">
          <b>{MONTHS_DE[m]}</b> <span>{y}</span>
        </div>
        <button type="button" className="dpk-nav next" aria-label="Nächster Monat" onClick={() => setYm(new Date(y, m + 1, 1, 12))}>
          <Icon name="chev" />
        </button>
      </div>
      <div className="dpk-grid">
        <span className="dpk-wd dpk-kwh">KW</span>
        {WD_SHORT.map((w, i) => (
          <span key={w} className={`dpk-wd${i >= 5 ? ' we' : ''}`}>
            {w}
          </span>
        ))}
        {rows}
      </div>
      <div className="dpk-foot">
        <button type="button" className="dpk-link" disabled={!ok(today)} onClick={() => pick(today)}>
          {week ? 'Diese Woche' : 'Heute'}
        </button>
        {clearable && value && (
          <button type="button" className="dpk-link muted" onClick={() => pick('')}>
            Entfernen
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Monatsauswahl (Monatsansicht im Kalenderkopf) */
export function MonthPickerPop({ anchor, value, onPick, onClose }: { anchor: HTMLElement | null; value: string; onPick: (iso: string) => void; onClose: () => void }) {
  const cur = value ? day(value) : new Date();
  const [y, setY] = useState(cur.getFullYear());
  const ref = useRef<HTMLDivElement>(null);
  const show = useShow();
  usePlace(anchor, ref, [y]);
  useDismiss(ref, anchor, onClose);
  const now = new Date();
  const pick = (yy: number, mm: number) => {
    onClose();
    onPick(`${yy}-${String(mm + 1).padStart(2, '0')}-01`);
  };
  return createPortal(
    <div ref={ref} className={`dpk-pop dpk-months${show ? ' show' : ''}`} role="dialog" aria-label="Monat auswählen" onClick={(e) => e.stopPropagation()}>
      <div className="dpk-head">
        <button type="button" className="dpk-nav" aria-label="Voriges Jahr" onClick={() => setY(y - 1)}>
          <Icon name="chev" />
        </button>
        <div className="dpk-title">
          <b>{y}</b>
        </div>
        <button type="button" className="dpk-nav next" aria-label="Nächstes Jahr" onClick={() => setY(y + 1)}>
          <Icon name="chev" />
        </button>
      </div>
      <div className="dpk-mgrid">
        {MON_SHORT.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`dpk-mon${y === cur.getFullYear() && i === cur.getMonth() ? ' on' : ''}${y === now.getFullYear() && i === now.getMonth() ? ' today' : ''}`}
            aria-label={`${MONTHS_DE[i]} ${y}`}
            onClick={() => pick(y, i)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="dpk-foot">
        <button type="button" className="dpk-link" onClick={() => pick(now.getFullYear(), now.getMonth())}>
          Dieser Monat
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Datumsfeld mit eigener Auswahl. Ein verstecktes <input type="date"> sorgt für die Pflichtfeld-Prüfung im Formular. */
export function DateField({
  value,
  onChange,
  min,
  max,
  required,
  ariaLabel,
  compact,
  allowed,
  rangeFrom,
  rangeTo,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  ariaLabel?: string;
  compact?: boolean;
  allowed?: (iso: string) => boolean;
  rangeFrom?: string;
  rangeTo?: string;
  disabled?: boolean;
}) {
  const { f } = useApp();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const ok = (iso: string) => (!min || iso >= min) && (!max || iso <= max) && (!allowed || allowed(iso));
  const d = value ? day(value) : null;
  const hol = value ? holidayName(value) : '';
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <input type="date" className="dpk-native" tabIndex={-1} aria-hidden="true" value={value} min={min} max={max} required={required} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <button
        ref={btn}
        type="button"
        className={`dpk-btn${compact ? ' compact' : ''}${open ? ' open' : ''}${value && !ok(value) ? ' bad' : ''}`}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {!compact && <Icon name="cal" />}
        <span className={value ? '' : 'ph'}>{d ? (compact ? `${WD_SHORT[(d.getDay() + 6) % 7]}, ${f.fmt(d)}` : f.fmtWithWeekday(d)) : 'Datum wählen'}</span>
        {!compact && hol && <em className="dpk-btn-hol">{hol}</em>}
      </button>
      {open && <DayPickerPop anchor={btn.current} value={value} onPick={onChange} onClose={close} min={min} max={max} allowed={allowed} rangeFrom={rangeFrom} rangeTo={rangeTo} clearable={!required} />}
    </>
  );
}

/* ---------------------------------------------------------------- Farbwähler */
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const hex2rgb = (hex: string): [number, number, number] | null => {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)) as [number, number, number] : null;
};
const rgb2hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
const rgb2hsv = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  if (d) {
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
};
const hsv2rgb = (h: number, s: number, v: number): [number, number, number] => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return [f(5), f(3), f(1)];
};
const RECENT_KEY = 'dienstplanRecentColors';
const recentColors = (): string[] => {
  try {
    return ((JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[]) || []).filter((c) => hex2rgb(c)).slice(0, 8);
  } catch {
    return [];
  }
};
const rememberColor = (c: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...recentColors().filter((x) => x !== c)].slice(0, 8)));
  } catch {
    /* Speicher nicht verfügbar */
  }
};

/** Farbwähler-Popup: Fläche + Farbton ziehen, Hex/RGB eintippen, „Speichern“ übernimmt */
export function ColorPickerPop({ anchor, value, onPreview, onSave, onClose }: { anchor: HTMLElement | null; value: string; onPreview?: (c: string) => void; onSave: (c: string) => void; onClose: () => void }) {
  const orig = hex2rgb(value) ? value.toLowerCase() : '#14a1a9';
  const [hsv, setHsv] = useState<[number, number, number]>(() => rgb2hsv(...(hex2rgb(orig) as [number, number, number])));
  const [hexText, setHexText] = useState(orig.toUpperCase());
  const [rgbText, setRgbText] = useState<string[]>(() => (hex2rgb(orig) as number[]).map(String));
  const [recent] = useState(recentColors);
  const [sheet, setSheet] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  const sv = useRef<HTMLDivElement>(null);
  const hue = useRef<HTMLDivElement>(null);
  const [h, s, v] = hsv;
  const hsvRef = useRef(hsv);
  useEffect(() => {
    hsvRef.current = hsv;
  }, [hsv]);
  const hexNow = rgb2hex(...hsv2rgb(h, s, v));

  const setFrom = (next: [number, number, number], skip?: 'hex' | 'rgb') => {
    hsvRef.current = next;
    setHsv(next);
    const c = rgb2hex(...hsv2rgb(...next));
    if (skip !== 'hex') setHexText(c.toUpperCase());
    if (skip !== 'rgb') setRgbText((hex2rgb(c) as number[]).map(String));
    onPreview?.(c);
  };
  const cancel = useCallback(() => {
    onPreview?.(orig);
    onClose();
    anchor?.focus({ preventScroll: true });
  }, [onPreview, orig, onClose, anchor]);
  const save = () => {
    rememberColor(hexNow);
    onClose();
    onSave(hexNow);
    anchor?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    const el = pop.current;
    if (!el) return;
    const place = () => {
      if (window.innerWidth <= 560) {
        setSheet(true);
        el.style.left = el.style.top = '';
        return;
      }
      setSheet(false);
      const r = (anchor || document.body).getBoundingClientRect(),
        pw = el.offsetWidth,
        ph = el.offsetHeight,
        vw = window.innerWidth,
        vh = window.innerHeight;
      const left = clamp(r.left + r.width / 2 - pw / 2, 8, vw - pw - 8);
      let top = r.bottom + 8;
      if (top + ph > vh - 8) top = r.top - ph - 8;
      if (top < 8) top = clamp((vh - ph) / 2, 8, vh - ph - 8);
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    };
    place();
    window.addEventListener('resize', place);
    if (!window.matchMedia('(pointer: coarse)').matches) setTimeout(() => sv.current?.focus({ preventScroll: true }), 20);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancel();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [cancel]);

  const drag = (fn: (e: { clientX: number; clientY: number }) => void) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    e.preventDefault();
    el.focus({ preventScroll: true });
    el.setPointerCapture(e.pointerId);
    fn(e);
    const mv = (ev: PointerEvent) => fn(ev);
    const up = () => {
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const svMove = (e: { clientX: number; clientY: number }) => {
    const r = sv.current!.getBoundingClientRect();
    setFrom([hsvRef.current[0], clamp((e.clientX - r.left) / r.width, 0, 1), 1 - clamp((e.clientY - r.top) / r.height, 0, 1)]);
  };
  const hueMove = (e: { clientX: number; clientY: number }) => {
    const r = hue.current!.getBoundingClientRect();
    setFrom([clamp((e.clientX - r.left) / r.width, 0, 1) * 359.9, hsvRef.current[1], hsvRef.current[2]]);
  };

  const svKey = (e: ReactKeyboardEvent) => {
    const d = e.shiftKey ? 0.1 : 0.02;
    let [nh, ns, nv] = hsv;
    if (e.key === 'ArrowLeft') ns = clamp(ns - d, 0, 1);
    else if (e.key === 'ArrowRight') ns = clamp(ns + d, 0, 1);
    else if (e.key === 'ArrowUp') nv = clamp(nv + d, 0, 1);
    else if (e.key === 'ArrowDown') nv = clamp(nv - d, 0, 1);
    else if (e.key === 'Enter') return save();
    else return;
    e.preventDefault();
    setFrom([nh, ns, nv]);
  };
  const hueKey = (e: ReactKeyboardEvent) => {
    const d = e.shiftKey ? 15 : 3;
    let nh = h;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nh = (h - d + 360) % 360;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nh = (h + d) % 360;
    else if (e.key === 'Enter') return save();
    else return;
    e.preventDefault();
    setFrom([nh, s, v]);
  };

  return createPortal(
    <div className="cp-layer" onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); cancel(); } }} onClick={(e) => e.stopPropagation()}>
      <div ref={pop} className={`cp-pop${sheet ? ' sheet' : ''}`} role="dialog" aria-modal="true" aria-label="Farbe wählen">
        <div className="cp-head">
          <b>Farbe wählen</b>
          <small>Ziehen, bis die Farbe passt</small>
        </div>
        <div ref={sv} className="cp-sv" tabIndex={0} aria-label="Sättigung und Helligkeit" style={{ '--hue': `hsl(${h} 100% 50%)` } as CSSProperties} onPointerDown={drag(svMove)} onKeyDown={svKey}>
          <div className="cp-knob" style={{ left: s * 100 + '%', top: (1 - v) * 100 + '%', background: hexNow }} />
        </div>
        <div ref={hue} className="cp-hue" tabIndex={0} aria-label="Farbton" onPointerDown={drag(hueMove)} onKeyDown={hueKey}>
          <div className="cp-hue-knob" style={{ left: (h / 360) * 100 + '%', background: `hsl(${h} 100% 50%)` }} />
        </div>
        <div className="cp-row">
          <span className="cp-prev" title="Vorher / Nachher">
            <i className="cp-old" style={{ background: orig }} />
            <i className="cp-new" style={{ background: hexNow }} />
          </span>
          <label className="cp-field cp-hexf">
            <small>Hex</small>
            <input
              className="cp-hex"
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              value={hexText}
              onChange={(e) => {
                setHexText(e.target.value);
                const rgb = hex2rgb(e.target.value);
                if (rgb) setFrom(rgb2hsv(...rgb), 'hex');
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())}
            />
          </label>
          {['R', 'G', 'B'].map((k, i) => (
            <label key={k} className="cp-field">
              <small>{k}</small>
              <input
                className="cp-rgb"
                inputMode="numeric"
                maxLength={3}
                value={rgbText[i]}
                onChange={(e) => {
                  const next = rgbText.map((x, j) => (j === i ? e.target.value : x));
                  setRgbText(next);
                  if (next.every((y) => /^\d{1,3}$/.test(y))) setFrom(rgb2hsv(...(next.map((n) => clamp(+n, 0, 255)) as [number, number, number])), 'rgb');
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())}
              />
            </label>
          ))}
        </div>
        {recent.length > 0 && (
          <div className="cp-recent">
            <small>Zuletzt verwendet</small>
            <div>
              {recent.map((c) => (
                <button key={c} type="button" className="cp-sw" style={{ '--c': c } as CSSProperties} aria-label={c} onClick={() => setFrom(rgb2hsv(...(hex2rgb(c) as [number, number, number])))} />
              ))}
            </div>
          </div>
        )}
        <div className="cp-actions">
          <button type="button" className="btn" onClick={cancel}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={save}>
            <Icon name="check" />
            Speichern
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Farbfeld (Farbfläche als Knopf) – öffnet den eigenen Farbwähler. Während des Ziehens: Vorschau, „Speichern“: übernehmen. */
export function ColorField({ value, onChange, onPreview, ariaLabel = 'Farbe wählen', className = '', disabled }: { value: string; onChange: (c: string) => void; onPreview?: (c: string) => void; ariaLabel?: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const shown = preview ?? value;
  const close = useCallback(() => {
    setOpen(false);
    setPreview(null);
  }, []);
  const openIt = () => !disabled && setOpen(true);
  return (
    <>
      <input
        ref={ref}
        type="text"
        data-color-input=""
        data-cp-init="1"
        readOnly
        inputMode="none"
        role="button"
        aria-label={ariaLabel}
        className={className}
        value={shown}
        disabled={disabled}
        style={{ '--cv': shown } as CSSProperties}
        onPointerDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openIt();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openIt();
          }
        }}
      />
      {open && (
        <ColorPickerPop
          anchor={ref.current}
          value={value}
          onPreview={(c) => {
            setPreview(c);
            onPreview?.(c);
          }}
          onSave={(c) => {
            setPreview(null);
            onChange(c);
          }}
          onClose={close}
        />
      )}
    </>
  );
}
