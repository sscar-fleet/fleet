'use client';
// Bulle d'aide à la première ouverture de chaque écran : une phrase, ce qu'on fait ici, et c'est tout.
// Elle ne revient plus une fois « Compris » touché (mémoire du navigateur).
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const AIDES: [RegExp, string, string][] = [
  [/^\/$/, 'accueil', 'Votre journée en 3 blocs : ce qu’il faut faire maintenant, les départs et retours, puis votre flotte en direct.'],
  [/^\/planning$/, 'planning', 'Glissez une location pour la déplacer, tirez son bord droit pour la prolonger. Une case vide : cliquez pour réserver.'],
  [/^\/locations$/, 'locations', 'Toutes vos locations. Cliquez sur une ligne pour ouvrir le contrat, l’état des lieux et la caution.'],
  [/^\/locations\/[0-9a-f-]{36}$/, 'location', 'Tout le contrat ici : départ, retour, caution, état des lieux et historique. Les boutons en haut suivent l’étape en cours.'],
  [/^\/vehicules$/, 'vehicules', 'Cliquez sur le kilométrage ou le prix pour le modifier directement. Sur ordinateur, une ligne s’ouvre sur le côté.'],
  [/^\/vehicules\/[0-9a-f-]{36}$/, 'vehicule', 'La fiche complète : position en direct, papiers, entretien, rentabilité et tout ce qui s’est passé sur la voiture.'],
  [/^\/clients$/, 'clients', 'Vos clients et leurs papiers. Un client à risque se marque en liste noire, Fleet vous prévient s’il revient.'],
  [/^\/clients\/[0-9a-f-]{36}$/, 'client', 'Coordonnées, papiers, locations et amendes du client, au même endroit.'],
  [/^\/amendes$/, 'amendes', 'Photographiez l’avis : Fleet retrouve le conducteur. Cochez plusieurs amendes pour les traiter d’un coup.'],
  [/^\/fps$/, 'fps', 'Forfaits post-stationnement : Fleet calcule l’échéance, la majoration et prépare la relance du client.'],
  [/^\/carte$/, 'carte', 'Où est chaque voiture, qui roule, qui est à l’arrêt. La coupure moteur est sur la fiche du véhicule.'],
  [/^\/pilotage$/, 'pilotage', 'Ce que vous encaissez, ce que vous dépensez, et ce que rapporte chaque voiture.'],
];

export default function BulleAide() {
  const chemin = usePathname();
  const params = useSearchParams();
  const [aide, setAide] = useState<{ cle: string; texte: string } | null>(null);
  useEffect(() => {
    setAide(null);
    if (window.self !== window.top || params.get('guide')) return; // pas dans le panneau latéral ni pendant une mission
    const a = AIDES.find(([re]) => re.test(chemin));
    if (!a) return;
    try { if (localStorage.getItem('bulle:' + a[1])) return; } catch { return; }
    const t = setTimeout(() => setAide({ cle: a[1], texte: a[2] }), 600);
    return () => clearTimeout(t);
  }, [chemin, params]);
  if (!aide) return null;
  const compris = () => { try { localStorage.setItem('bulle:' + aide.cle, '1'); } catch {} setAide(null); };
  return (
    <div className="bulle-aide" role="status">
      <span className="bulle-icone" aria-hidden>?</span>
      <p>{aide.texte}</p>
      <button type="button" className="bouton petit principal" onClick={compris}>Compris</button>
    </div>
  );
}
