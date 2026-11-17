'use client';
/* Wiederverwendbare Bausteine: Icon, Avatar, Dialoge, Auswahllisten, Schalter */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useApp } from '../AppProvider';
import { initials } from '@/lib/demo-data';

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <svg className={`ic ${className}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export function Avatar({ name, color, size = 30 }: { name: string; color?: string; size?: number }) {
  const { data } = useApp();
  const p = data.staff.find((x) => x.name === name);
  return (
    <span className="av" style={{ '--c': color || 'var(--accent-color)', width: size, height: size, fontSize: Math.round(size * 0.36) } as CSSProperties}>
      {p?.photo ? <img src={p.photo} alt="" /> : initials(name)}
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return <i className="dot" style={{ '--c': color } as CSSProperties} />;
}

export function Heading({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
      </div>
      <div className="btn-row">{actions}</div>
    </div>
  );
}

export function StatCard({ label, value, note, icon, tone = '', children }: { label: ReactNode; value: ReactNode; note?: ReactNode; icon?: string; tone?: string; children?: ReactNode }) {
  return (
    <div className="stat-card dash-stat">
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {note !== undefined && <div className="stat-note">{note}</div>}
        {children}
      </div>
      {icon && (
        <div className={`stat-icon ${tone}`}>
          <Icon name={icon} className={icon === 'travel' ? 'ic-fill' : ''} />
        </div>
      )}
    </div>
  );
}

export function Meter({ pct, warn }: { pct: number; warn?: boolean }) {
  return (
    <div className={`meter ${warn ? 'warn' : ''}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** Esc schließt; Klick auf den Hintergrund schließt */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.app-dialog')) return; // Bestätigungsdialog hat Vorrang
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
}

/** Dialog im Stil der Eingabemasken (wp-modal) */
export function Modal({
  title,
  sub,
  icon,
  className = '',
  onClose,
  children,
  footer,
  onSubmit,
  headStyle,
}: {
  title: ReactNode;
  sub?: ReactNode;
  icon?: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: () => void;
  headStyle?: CSSProperties;
}) {
  useEscape(onClose);
  const down = useRef(false);
  const Body = onSubmit ? 'form' : 'div';
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => (down.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (e.target === e.currentTarget && down.current) onClose();
      }}
    >
      <div className={`modal wp-modal ${className}`} role="dialog" aria-modal="true">
        <div className="wp-head">
          {icon && (
            <span className="wp-head-icon" style={headStyle}>
              <Icon name={icon} />
            </span>
          )}
          <div>
            <h2>{title}</h2>
            {sub && <p className="small muted">{sub}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <Body
          className="wp-form"
          noValidate
          onSubmit={
            onSubmit
              ? (e: React.FormEvent) => {
                  e.preventDefault();
                  onSubmit();
                }
              : undefined
          }
        >
          {children}
          {footer && <div className="btn-row modal-actions wp-actions">{footer}</div>}
        </Body>
      </div>
    </div>
  );
}

/** Standard-Fußzeile: Abbrechen + Speichern */
export function ModalActions({ onCancel, okLabel = 'Speichern', disabled, left }: { onCancel: () => void; okLabel?: string; disabled?: boolean; left?: ReactNode }) {
  return (
    <>
      {left || <span />}
      <span className="wp-actions-right">
        <button type="button" className="btn" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn primary" disabled={disabled}>
          <Icon name="check" />
          {okLabel}
        </button>
      </span>
    </>
  );
}

/** Info-Dialog (ohne Formular) */
export function InfoDialog({ title, sub, onClose, children, className = '' }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; className?: string }) {
  useEscape(onClose);
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal form-dialog dash-dialog ${className}`} role="dialog" aria-modal="true">
        <div className="panel-head">
          <div>
            <h2>{title}</h2>
            {sub && <p className="small muted">{sub}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <div className="dash-dialog-body">{children}</div>
        <div className="btn-row modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children, note, className = '' }: { label: ReactNode; children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={`wp-field ${className}`}>
      <span className="wp-label">{label}</span>
      {children}
      {note && <small className="wp-note">{note}</small>}
    </div>
  );
}

export function DateRange({ from, to, onFrom, onTo, fromLabel = 'Von', toLabel = 'Bis', toRequired = true, min, max }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; fromLabel?: string; toLabel?: string; toRequired?: boolean; min?: string; max?: string }) {
  return (
    <div className="wp-range">
      <label>
        <small>{fromLabel}</small>
        <input
          type="date"
          value={from}
          min={min || '2000-01-01'}
          max={max || '2099-12-31'}
          required
          onChange={(e) => {
            const v = e.target.value;
            onFrom(v);
            if (v && (!to || to < v)) onTo(v);
          }}
        />
      </label>
      <span className="wp-range-arrow" aria-hidden="true">
        →
      </span>
      <label>
        <small>{toLabel}</small>
        <input type="date" value={to} min={from || min || '2000-01-01'} max={max || '2099-12-31'} required={toRequired} onChange={(e) => onTo(e.target.value)} />
      </label>
    </div>
  );
}

export function TimeRange({ start, end, onStart, onEnd, startLabel = 'Beginn', endLabel = 'Ende' }: { start: string; end: string; onStart: (v: string) => void; onEnd: (v: string) => void; startLabel?: string; endLabel?: string }) {
  return (
    <div className="wp-range">
      <label>
        <small>{startLabel}</small>
        <input type="time" value={start} onChange={(e) => onStart(e.target.value)} />
      </label>
      <span className="wp-range-arrow" aria-hidden="true">
        →
      </span>
      <label>
        <small>{endLabel}</small>
        <input type="time" value={end} onChange={(e) => onEnd(e.target.value)} />
      </label>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" className={String(value) === String(v) ? 'active' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Schließt ein Popover bei Klick daneben / Esc */
export function useOutside(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open, ref, close]);
}

export interface PickOption {
  value: string;
  label: string;
  sub?: string;
  color?: string;
  /** person | team | shift (Symbol) */
  pic?: 'person' | 'team' | 'icon';
  icon?: string;
  badge?: string;
}

/** Auswahl mit Suche (Personen, Teams, Dienste) – ersetzt <select> im Stil der Personenauswahl */
export function Picker({ value, options, onChange, placeholder = 'Bitte auswählen', search = 'Suchen …', empty = 'Keine Treffer', disabled, noneLabel }: { value: string; options: PickOption[]; onChange: (v: string) => void; placeholder?: string; search?: string; empty?: string; disabled?: boolean; noneLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useOutside(open, ref, () => setOpen(false));
  const all = useMemo(() => (noneLabel ? [{ value: '', label: noneLabel }, ...options] : options), [options, noneLabel]);
  const cur = all.find((o) => o.value === value && (value !== '' || noneLabel));
  const list = all.filter((o) => !q || (o.label + ' ' + (o.sub || '')).toLowerCase().includes(q.toLowerCase()));
  const few = all.length <= 6;
  const row = (o: PickOption) => (
    <>
      {o.pic === 'person' ? (
        <Avatar name={o.label} color={o.color} size={30} />
      ) : o.pic ? (
        <span className="pp-team" style={{ '--c': o.color || 'var(--accent-color)' } as CSSProperties}>
          <Icon name={o.pic === 'team' ? 'users' : o.icon || 'clock'} />
        </span>
      ) : o.value === '' && noneLabel ? (
        <span className="pp-none">–</span>
      ) : null}
      <span className="pp-txt">
        <b className={o.value === '' && noneLabel ? 'muted' : ''}>{o.label}</b>
        {o.sub && <small>{o.sub}</small>}
      </span>
    </>
  );
  return (
    <div className={`pp fs ${open ? 'open' : ''} ${few ? 'pp-few' : ''}`} ref={ref}>
      <button type="button" className="pp-btn" aria-haspopup="listbox" aria-expanded={open} disabled={disabled || !options.length} onClick={() => setOpen((o) => !o)}>
        {cur ? (
          row(cur)
        ) : (
          <span className="pp-txt">
            <b className="muted">{options.length ? placeholder : empty}</b>
          </span>
        )}
        <Icon name="down" className="pp-caret" />
      </button>
      {open && (
        <div className="pp-panel pp-panel-inline">
          {!few && (
            <label className="team-dd-search">
              <Icon name="search" />
              <input type="search" className="pp-q" placeholder={search} autoComplete="off" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          )}
          <div className="pp-list" role="listbox">
            {list.map((o) => (
              <button
                key={o.value || '__none'}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`pp-opt ${o.value === value ? 'on' : ''}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQ('');
                }}
              >
                {row(o)}
                {o.badge && <em className="pp-badge">{o.badge}</em>}
                <span className="pp-check">
                  <Icon name="check" />
                </span>
              </button>
            ))}
            {!list.length && <div className="team-dd-empty">{empty}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Mehrfachauswahl (Teams, Dienste) als Aufklappliste mit Suche */
export function MultiPick({ label, items, selected, onChange, allLabel = 'Alle', emptyLabel = 'Auswählen …', icon = 'users' }: { label?: ReactNode; items: { value: string; label: string; color?: string; small?: ReactNode; hidden?: boolean }[]; selected: string[]; onChange: (v: string[]) => void; allLabel?: string; emptyLabel?: string; icon?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useOutside(open, ref, () => setOpen(false));
  const vis = items.filter((i) => !i.hidden);
  const sel = selected.filter((s) => vis.some((i) => i.value === s));
  const text = !sel.length ? emptyLabel : sel.length === vis.length && vis.length > 1 ? `${allLabel} (${sel.length})` : sel.length > 2 ? `${sel.slice(0, 2).map((s) => vis.find((i) => i.value === s)?.label).join(', ')} +${sel.length - 2}` : sel.map((s) => vis.find((i) => i.value === s)?.label).join(', ');
  const shown = vis.filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()));
  const box = (
    <div className={`team-dd dlg-team-dd ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="team-dd-summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="pp-team dlg-dd-ic" style={{ '--c': sel.length === 1 ? vis.find((i) => i.value === sel[0])?.color || 'var(--accent-color)' : 'var(--accent-color)' } as CSSProperties}>
          <Icon name={icon} />
        </span>
        <span className={`team-dd-text ${sel.length ? '' : 'muted'}`}>{text}</span>
        <Icon name="down" />
      </button>
      {open && (
        <div className="team-dd-panel">
          {vis.length > 5 && (
            <label className="team-dd-search">
              <Icon name="search" />
              <input type="search" className="dlg-dd-q" placeholder="Suchen …" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </label>
          )}
          {vis.length > 1 && !q && (
            <label className="check team-dd-all">
              <input type="checkbox" checked={sel.length === vis.length} onChange={(e) => onChange(e.target.checked ? vis.map((i) => i.value) : [])} />
              <span>{allLabel}</span>
            </label>
          )}
          <div className="dlg-dd-list">
            {shown.map((i) => (
              <label className="check" key={i.value}>
                <input type="checkbox" checked={sel.includes(i.value)} onChange={(e) => onChange(e.target.checked ? [...sel, i.value] : sel.filter((x) => x !== i.value))} />
                {i.color && <Dot color={i.color} />}
                <span>{i.label}</span>
                {i.small !== undefined && <small>{i.small}</small>}
              </label>
            ))}
            {!shown.length && <div className="team-dd-empty">Keine Treffer</div>}
          </div>
          {!!sel.length && (
            <div className="team-dd-foot">
              <span className="dd-count">{sel.length} ausgewählt</span>
              <button type="button" className="link-btn dd-clear" onClick={() => onChange([])}>
                Auswahl aufheben
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
  return label ? <Field label={label}>{box}</Field> : box;
}

/** Team-Filter (Dienstplan, Bereitschaft, Dienstzeiten, Berichte) */
export function TeamFilter({ teams, selected, onChange, count }: { teams: { name: string; color: string }[]; selected: string[]; onChange: (v: string[]) => void; count: (name: string) => number }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useOutside(open, ref, () => setOpen(false));
  const sel = selected.filter((n) => teams.some((t) => t.name === n));
  const label = !sel.length ? 'Alle Teams' : sel.length === 1 ? sel[0] : sel.length === 2 ? sel.join(', ') : sel.length + ' Teams';
  const shown = teams.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className={`team-dd ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className={`chip ${sel.length ? 'active' : ''} team-dd-btn`} aria-haspopup="listbox" aria-expanded={open} title={sel.join(', ') || 'Alle Teams'} onClick={() => setOpen((o) => !o)}>
        <Icon name="users" />
        {sel.length === 1 && <Dot color={teams.find((t) => t.name === sel[0])?.color || ''} />}
        <span className="team-dd-label">{label}</span>
        <Icon name="down" className="team-dd-caret" />
      </button>
      {open && (
        <div className="team-dd-panel">
          <label className="team-dd-search">
            <Icon name="search" />
            <input type="search" placeholder="Team suchen …" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </label>
          <div className="team-dd-list" role="listbox" aria-multiselectable="true">
            {!q && (
              <button type="button" className={`team-dd-opt all ${sel.length ? '' : 'on'}`} onClick={() => onChange([])}>
                <span className="team-dd-check">
                  <Icon name="check" />
                </span>
                Alle Teams
              </button>
            )}
            {shown.map((t) => (
              <button key={t.name} type="button" className={`team-dd-opt ${sel.includes(t.name) ? 'on' : ''}`} onClick={() => onChange(sel.includes(t.name) ? sel.filter((x) => x !== t.name) : [...sel, t.name])}>
                <span className="team-dd-check">
                  <Icon name="check" />
                </span>
                <Dot color={t.color} />
                <span className="team-dd-name">{t.name}</span>
                <small>{count(t.name)}</small>
              </button>
            ))}
            {!shown.length && <div className="team-dd-empty">Kein Team gefunden</div>}
          </div>
          {!!sel.length && (
            <div className="team-dd-foot">
              <span>{sel.length} ausgewählt</span>
              <button type="button" className="link-btn" onClick={() => onChange([])}>
                Auswahl aufheben
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Farbauswahl: Vorschläge + eigene Farbe (nativer Farbwähler) */
export function ColorChoice({ value, onChange, swatches }: { value: string; onChange: (c: string) => void; swatches: string[] }) {
  return (
    <div className="shift-color-presets">
      {swatches.map((c) => (
        <button key={c} type="button" className={`color-swatch ${c.toLowerCase() === value.toLowerCase() ? 'active' : ''}`} style={{ '--swatch': c } as CSSProperties} aria-label={`Farbe ${c}`} title={c} onClick={() => onChange(c)} />
      ))}
      <label className="color-swatch custom" title="Eigene Farbe wählen" style={{ '--cv': value } as CSSProperties}>
        <input type="color" value={value} aria-label="Eigene Farbe wählen" onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

/** Bild verkleinern (Profilbild) */
export function resizeImage(file: File, size = 160): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = rej;
    r.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const k = Math.max(size / img.width, size / img.height),
          w = img.width * k,
          h = img.height * k;
        const g = c.getContext('2d')!;
        g.fillStyle = '#fff';
        g.fillRect(0, 0, size, size);
        g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        res(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(r.result);
    };
    r.readAsDataURL(file);
  });
}

/** Aktuelles Datum erst im Browser (vermeidet Abweichungen zwischen Server und Client beim Hydrieren) */
const noopSubscribe = () => () => {};
export function useClientDate(): Date | null {
  const ts = useSyncExternalStore(
    noopSubscribe,
    () => Math.floor(Date.now() / 60000),
    () => null,
  );
  return useMemo(() => (ts === null ? null : new Date(ts * 60000)), [ts]);
}
