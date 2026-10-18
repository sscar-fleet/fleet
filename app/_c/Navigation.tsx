'use client';
import { usePathname } from 'next/navigation';

const liens = [
  ['/', 'Accueil'], ['/pilotage', 'Pilotage'], ['/planning', 'Planning'], ['/locations', 'Locations'], ['/vehicules', 'Véhicules'],
  ['/clients', 'Clients'], ['/amendes', 'Amendes'], ['/entretiens', 'Maintenance'], ['/parametres', 'Réglages'],
];

export default function Navigation() {
  const chemin = usePathname();
  return (
    <nav className="nav">
      {liens.map(([href, texte]) => {
        const actif = href === '/' ? chemin === '/' : chemin.startsWith(href);
        return <a key={href} href={href} className={actif ? 'actif' : ''}>{texte}</a>;
      })}
    </nav>
  );
}
