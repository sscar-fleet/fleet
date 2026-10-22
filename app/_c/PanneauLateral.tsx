'use client';
// Panneau de détail sur le côté (ordinateur) : un clic sur une ligne de liste ouvre la fiche à droite,
// la liste reste sous les yeux. Sur téléphone, le lien s'ouvre normalement. Ctrl/Cmd+clic : nouvel onglet.
import { useEffect, useState } from 'react';

export default function PanneauLateral() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (window.self !== window.top) { document.documentElement.classList.add('dans-panneau'); return; }
    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (window.innerWidth < 1100) return;
      const a = (e.target as HTMLElement)?.closest?.('main.page table a.bloc[href]') as HTMLAnchorElement | null;
      if (!a || !/^\/(vehicules|clients|locations)\/[0-9a-f-]{36}$/.test(new URL(a.href).pathname)) return;
      e.preventDefault(); setUrl(a.getAttribute('href'));
    };
    document.addEventListener('click', clic);
    return () => document.removeEventListener('click', clic);
  }, []);
  useEffect(() => {
    if (!url) return;
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setUrl(null); };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [url]);
  if (!url) return null;
  return (
    <div className="panneau-voile" onClick={() => setUrl(null)}>
      <aside className="panneau-lateral" onClick={(e) => e.stopPropagation()} aria-label="Détail">
        <div className="panneau-haut">
          <a className="bouton petit" href={url}>Ouvrir en grand</a>
          <button type="button" className="bouton petit" onClick={() => setUrl(null)} aria-label="Fermer">Fermer ✕</button>
        </div>
        <iframe src={url} title="Détail" />
      </aside>
    </div>
  );
}
