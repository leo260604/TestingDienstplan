'use client';
/* Ergänzungen wie in der bisherigen Browser-Version:
   - „Nach oben“-Knopf auf langen Seiten (Kontakte, Audit Log, Berichte, Administration, Hilfe)
   - Tabellen am Handy als Karten (jede Zelle mit Spaltenüberschrift)
   - Handy: Antippen einer Tabellenzeile öffnet die Details (mit Bearbeiten/Löschen bzw. „Report herunterladen“) */
import { useEffect, useState } from 'react';
import { useApp } from '../AppProvider';
import { Icon } from '../ui';
import { downloadCsv, safeFileName } from '@/lib/export/csv';
import { logExport } from '@/server/actions/account';
import type { Page } from '@/lib/types';

const TOP_PAGES: Page[] = ['Kontakte', 'Audit Log', 'Berichte / Export', 'Hilfe'];
const REPORT_PAGES: Page[] = ['Berichte / Export', 'Audit Log', 'Export Audit'];
const NO_CARDS = '.perm-table,.employee-directory-table-wrap,.report-table-wrap';

export function PageTopButton({ page, isAdmin }: { page: Page; isAdmin: boolean }) {
  const on = TOP_PAGES.includes(page) || (isAdmin && page === 'Administration');
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!on) {
      setShow(false);
      return;
    }
    const main = document.querySelector('.main');
    const sync = () => {
      const y = Math.max(window.scrollY, main?.scrollTop || 0);
      const long = document.documentElement.scrollHeight > window.innerHeight * 1.3 || (main ? main.scrollHeight > main.clientHeight * 1.3 : false);
      setShow(long && y > Math.min(400, window.innerHeight * 0.5));
    };
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    main?.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('scroll', sync);
      main?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [on, page]);
  if (!on) return null;
  return (
    <button
      type="button"
      id="page-top-btn"
      className={`help-top-btn${show ? ' show' : ''}`}
      aria-label="Nach oben"
      title="Nach oben"
      onClick={() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.querySelector('.main')?.scrollTo?.({ top: 0, behavior: 'smooth' });
      }}
    >
      <Icon name="down" />
    </button>
  );
}

interface Detail {
  title: string;
  fields: { label: string; html: string }[];
  actions: { label: string; kind: string; run: () => void }[];
}

/** Tabellen am Handy als Karten + Detailansicht beim Antippen einer Zeile */
export function MobileTables({ page }: { page: Page }) {
  const { toast, refresh } = useApp();
  const [detail, setDetail] = useState<Detail | null>(null);

  /* Spaltenüberschriften an die Zellen schreiben, damit die Karten-Ansicht sie anzeigen kann */
  useEffect(() => {
    const content = document.getElementById('content');
    if (!content) return;
    const label = () => {
      content.querySelectorAll<HTMLTableElement>('.table-wrap table').forEach((t) => {
        if (t.closest(NO_CARDS)) return;
        t.classList.add('cardify');
        const hs = [...t.querySelectorAll('thead th')].map((th) => (th.classList.contains('cb-col') ? '' : (th.textContent || '').trim()));
        t.querySelectorAll('tbody tr').forEach((tr) => {
          let i = 0;
          [...tr.children].forEach((td) => {
            const span = Number(td.getAttribute('colspan')) || 1;
            if (span === 1 && hs[i] && !(td as HTMLElement).dataset.label) (td as HTMLElement).dataset.label = hs[i];
            i += span;
          });
        });
      });
    };
    label();
    const mo = new MutationObserver(label);
    mo.observe(content, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [page]);

  /* Antippen einer Zeile (nur Handy, nur Tabellen ohne Karten-Ansicht) */
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (!window.matchMedia('(max-width: 700px)').matches) return;
      const target = e.target as HTMLElement;
      if (target.closest('button,a,input,select,label,summary')) return;
      const row = target.closest<HTMLTableRowElement>('.table-wrap tbody tr');
      if (!row || !row.closest('#content') || row.closest('table.cardify')) return;
      const table = row.closest('table');
      if (!table || row.querySelector('.empty-note')) return;
      const headers = [...table.querySelectorAll('thead th')];
      const cells = [...row.children] as HTMLElement[];
      if (!cells.length) return;
      const fields = headers
        .map((h, i) => ({ label: (h.textContent || '').trim(), html: cells[i]?.innerHTML || '—' }))
        .filter((x) => x.label && !/^aktion/i.test(x.label));
      if (!fields.length) return;
      const actions: Detail['actions'] = [];
      if (REPORT_PAGES.includes(page)) {
        actions.push({
          label: 'Report herunterladen',
          kind: 'primary',
          run: () => {
            const hs = headers.filter((x) => !x.classList.contains('cb-col')).map((x) => (x.textContent || '').trim()).filter((h) => h && !/^aktion/i.test(h));
            const vals = cells.filter((x) => !x.classList.contains('cb-col')).map((x) => x.innerText.trim().replace(/\s+/g, ' ')).slice(0, hs.length);
            downloadCsv([hs, vals], safeFileName(page) + '.csv');
            void logExport({ report: page + ' (Einzelzeile)', format: 'CSV', rows: 1, status: 'Erfolgreich' }).then(refresh);
            toast('Report wurde heruntergeladen.');
          },
        });
      } else {
        row.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
          const name = (b.getAttribute('aria-label') || b.title || b.textContent || '').trim();
          if (/bearbeit/i.test(name)) actions.push({ label: 'Bearbeiten', kind: '', run: () => b.click() });
          else if (/lösch|entfern/i.test(name)) actions.push({ label: 'Löschen', kind: 'danger', run: () => b.click() });
        });
      }
      setDetail({ title: ((cells[0]?.textContent || 'Eintrag').trim().slice(0, 80) || 'Details'), fields, actions });
    };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, [page, toast, refresh]);

  useEffect(() => {
    if (!detail) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setDetail(null);
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [detail]);

  if (!detail) return null;
  return (
    <div className="modal-backdrop mobile-table-detail" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
      <section className="modal mobile-table-detail-card" role="dialog" aria-modal="true" aria-labelledby="mobile-table-detail-title">
        <div className="panel-head">
          <h2 id="mobile-table-detail-title">{detail.title}</h2>
          <button className="icon-btn" type="button" aria-label="Schließen" onClick={() => setDetail(null)}>
            ×
          </button>
        </div>
        <div className="mobile-table-detail-content">
          {detail.fields.map((x, i) => (
            <div key={i} className="mobile-detail-field">
              <b>{x.label}</b>
              <div dangerouslySetInnerHTML={{ __html: x.html }} />
            </div>
          ))}
          {detail.actions.length > 0 && (
            <div className="mobile-detail-actions">
              {detail.actions.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  className={`btn ${a.kind}`}
                  onClick={() => {
                    setDetail(null);
                    a.run();
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
