'use client';
/* Sprache: Deutsch (Standard) / Englisch.
   Die Oberfläche wird auf Deutsch erzeugt; bei „English“ werden sichtbare Texte, Platzhalter und Tooltips
   automatisch übersetzt (wie in der Browser-Version). Auf Deutsch heißt „Deputy“ sichtbar „Stellvertretung“. */
import { useEffect } from 'react';
import { tr } from '@/lib/i18n/dictionary';

const ATTRS = ['placeholder', 'title', 'aria-label', 'data-label'];
const DE_RX = /\bDeputys\b|\bDeputy\b/g;
const deFix = (s: string) => s.replace(DE_RX, (m) => (m === 'Deputys' ? 'Stellvertretungen' : 'Stellvertretung'));

export function DomTranslator({ lang }: { lang: 'de' | 'en' }) {
  useEffect(() => {
    if (lang !== 'en') return; // Deutsch: Texte werden direkt so gerendert (Stellvertretung statt Deputy)
    const fix = (s: string) => tr(deFix(s)) as string;
    const skip = (el: Element | null) => !!el?.closest('script,style,textarea,[data-no-translate],[contenteditable="true"]');
    const node = (root: Node) => {
      if (root.nodeType === 3) {
        if (skip(root.parentElement)) return;
        const v = fix(root.nodeValue || '');
        if (v !== root.nodeValue) root.nodeValue = v;
        return;
      }
      if (root.nodeType !== 1 || skip(root as Element)) return;
      const attrs = (el: Element) =>
        ATTRS.forEach((a) => {
          const v = el.getAttribute(a);
          if (v) {
            const n = fix(v);
            if (n !== v) el.setAttribute(a, n);
          }
        });
      attrs(root as Element);
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n: Node | null;
      while ((n = w.nextNode())) {
        if (n.nodeType === 3) {
          if (skip(n.parentElement)) continue;
          const v = fix(n.nodeValue || '');
          if (v !== n.nodeValue) n.nodeValue = v;
        } else attrs(n as Element);
      }
    };
    let mo: MutationObserver | null = null;
    // erst nach der Hydrierung übersetzen, sonst passt der vom Server gerenderte Text nicht mehr
    const start = () => {
    node(document.body);
    mo = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(node);
        else node(m.target);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    document.title = 'DienstPlan Pro – Duty & on-call management';
    };
    const t = setTimeout(start, 400);
    return () => {
      clearTimeout(t);
      mo?.disconnect();
    };
  }, [lang]);
  return null;
}
