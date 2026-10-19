'use client';
// Menu de gauche (ordinateur) : toutes les rubriques visibles, regroupées par usage, repliable en icônes
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Ico = 'accueil' | 'planning' | 'locations' | 'vehicules' | 'clients' | 'carte' | 'amendes' | 'entretiens' | 'pilotage' | 'devis' | 'reglages' | 'plus' | 'replier';
function Icone({ nom }: { nom: Ico }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      {nom === 'accueil' && <><path d="M3.5 11 12 4l8.5 7" {...p} /><path d="M6 9.5V20h12V9.5" {...p} /><path d="M10 20v-5h4v5" {...p} /></>}
      {nom === 'planning' && <><rect x="3" y="4.5" width="18" height="16" rx="3" {...p} /><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7 13.5h4M13 13.5h4M7 17h4" {...p} /></>}
      {nom === 'locations' && <><path d="M4 8h13l-3-3M20 16H7l3 3" {...p} /></>}
      {nom === 'vehicules' && <><path d="M5 16.5V12l2-5h10l2 5v4.5" {...p} /><path d="M3.5 16.5h17V19h-17z" {...p} /><circle cx="7.5" cy="13.5" r="1" fill="currentColor" /><circle cx="16.5" cy="13.5" r="1" fill="currentColor" /></>}
      {nom === 'clients' && <><circle cx="9" cy="8.5" r="3.5" {...p} /><path d="M2.5 20c.9-3.4 3.4-5.2 6.5-5.2s5.6 1.8 6.5 5.2M16 5.5a3.2 3.2 0 0 1 0 6.2M18 14.8c1.8.6 3 2.3 3.5 5" {...p} /></>}
      {nom === 'carte' && <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" {...p} /><path d="M9 4v14M15 6v14" {...p} /></>}
      {nom === 'amendes' && <><path d="M6 3h9l4 4v14H6z" {...p} /><path d="M14.5 3v4.5H19M9 12h7M9 16h5" {...p} /></>}
      {nom === 'entretiens' && <path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5zM14.5 6.5 17 4" {...p} />}
      {nom === 'pilotage' && <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...p} /></>}
      {nom === 'devis' && <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" {...p} /><path d="M9 8h6M9 12h6" {...p} /></>}
      {nom === 'reglages' && <><circle cx="12" cy="12" r="3" {...p} /><path d="M12 2.5v3M12 18.5v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1" {...p} /></>}
      {nom === 'plus' && <path d="M12 5v14M5 12h14" {...p} strokeWidth={2.4} />}
      {nom === 'replier' && <path d="M15 5l-7 7 7 7" {...p} />}
    </svg>
  );
}

const GROUPES: { titre: string; liens: [string, string, Ico][] }[] = [
  { titre: 'Au quotidien', liens: [['/', 'Accueil', 'accueil'], ['/planning', 'Planning', 'planning'], ['/locations', 'Locations', 'locations'], ['/vehicules', 'Véhicules', 'vehicules'], ['/clients', 'Clients', 'clients']] },
  { titre: 'Suivi', liens: [['/carte', 'Carte GPS', 'carte'], ['/amendes', 'Amendes', 'amendes'], ['/entretiens', 'Maintenance', 'entretiens']] },
  { titre: 'Gestion', liens: [['/pilotage', 'Pilotage', 'pilotage'], ['/devis', 'Devis', 'devis'], ['/parametres', 'Réglages', 'reglages']] },
];

export default function MenuLateral({ gerant, compteurs, pied }: { gerant: boolean; compteurs: Record<string, number>; pied: React.ReactNode }) {
  const chemin = usePathname();
  const [replie, setReplie] = useState(false);
  useEffect(() => { try { setReplie(localStorage.getItem('fleet-menu-replie') === '1'); } catch {} }, []);
  useEffect(() => { document.documentElement.dataset.menu = replie ? 'replie' : 'ouvert'; }, [replie]);
  const actif = (href: string) => (href === '/' ? chemin === '/' : chemin.startsWith(href));
  const basculer = () => { setReplie((r) => { try { localStorage.setItem('fleet-menu-replie', r ? '0' : '1'); } catch {} return !r; }); };

  return (
    <aside className="menu-lateral" aria-label="Menu principal">
      <div className="ml-haut">
        <a href="/" className="ml-logo" aria-label="Accueil"><span className="logo-double"><img src="/logo-blanc.svg" alt="SS CAR FLEET" className="logo-sombre" /><img src="/logo-noir.svg" alt="" className="logo-clair" /></span></a>
        <button type="button" className="ml-replier" onClick={basculer} aria-label={replie ? 'Déplier le menu' : 'Replier le menu'} title={replie ? 'Déplier le menu' : 'Replier le menu'}><Icone nom="replier" /></button>
      </div>
      <a href="/locations/nouvelle" className="ml-nouvelle" title="Nouvelle location"><Icone nom="plus" /><span>Nouvelle location</span></a>
      <nav className="ml-liens">
        {GROUPES.map((g) => (
          <div key={g.titre} className="ml-groupe">
            <div className="ml-titre">{g.titre}</div>
            {g.liens.filter(([h]) => gerant || h !== '/pilotage').map(([h, t, i]) => (
              <a key={h} href={h} className={actif(h) ? 'actif' : ''} title={t}>
                <Icone nom={i} /><span>{t}</span>
                {compteurs[h] ? <b className="ml-compteur">{compteurs[h]}</b> : null}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="ml-pied">{pied}</div>
    </aside>
  );
}
