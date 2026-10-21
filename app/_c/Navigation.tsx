'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const principaux: [string, string, string][] = [
  ['/', 'Accueil', '⌂'], ['/planning', 'Planning', '▦'], ['/locations', 'Locations', '⇄'], ['/vehicules', 'Véhicules', '🚗'], ['/clients', 'Clients', '👤'],
];
const autres: [string, string][] = [
  ['/carte', 'Suivi GPS'], ['/devis', 'Devis'], ['/amendes', 'Amendes'], ['/entretiens', 'Maintenance'], ['/prets', 'Prêts confrères'], ['/pilotage', 'Pilotage (argent)'], ['/parametres', 'Réglages'],
];

export default function Navigation({ gerant = true }: { gerant?: boolean }) {
  const chemin = usePathname();
  const actif = (href: string) => (href === '/' ? chemin === '/' : chemin.startsWith(href));
  const liste = autres.filter(([h]) => gerant || h !== '/pilotage');
  const plusActif = liste.some(([h]) => actif(h));
  const menus = useRef<HTMLDetailsElement[]>([]);
  // Fermer le menu « Plus » quand on touche ailleurs
  useEffect(() => {
    const fermer = (e: MouseEvent) => menus.current.forEach((d) => { if (d && !d.contains(e.target as Node)) d.open = false; });
    document.addEventListener('click', fermer);
    return () => document.removeEventListener('click', fermer);
  }, []);
  const menu = (
    <div className="menu-plus">
      {liste.map(([h, t]) => <a key={h} href={h} className={actif(h) ? 'actif' : ''}>{t}</a>)}
    </div>
  );
  return (
    <>
      <nav className="nav">
        {principaux.map(([h, t]) => <a key={h} href={h} className={actif(h) ? 'actif' : ''}>{t}</a>)}
        <details className={`plus ${plusActif ? 'actif' : ''}`} ref={(el) => { if (el) menus.current[0] = el; }}>
          <summary>Plus ▾</summary>
          {menu}
        </details>
      </nav>
      <nav className="barre-bas">
        {principaux.slice(0, 4).map(([h, t, i]) => <a key={h} href={h} className={actif(h) ? 'actif' : ''}><span className="ico">{i}</span>{t}</a>)}
        <details className={plusActif || actif('/clients') ? 'actif' : ''} ref={(el) => { if (el) menus.current[1] = el; }}>
          <summary><span className="ico">☰</span>Plus</summary>
          <div className="menu-plus">
            <a href="/clients" className={actif('/clients') ? 'actif' : ''}>Clients</a>
            {liste.map(([h, t]) => <a key={h} href={h} className={actif(h) ? 'actif' : ''}>{t}</a>)}
          </div>
        </details>
      </nav>
    </>
  );
}
