'use client';
// Bulle d'aide de la mission en cours (lien « ?guide=… » du parcours découverte), en haut de l'écran.
import { useEffect, useState } from 'react';
import { MISSIONS, DECOUVERTES_PAR_VISITE } from '@/lib/decouverte';
import { marquerDecouverte } from '../actions';

const CONSIGNES: Record<string, string> = {
  agence: 'Remplissez l’adresse et le nom du gérant, puis dessinez votre signature : elle sera posée sur vos contrats.',
  flotte: 'Touchez « Importer depuis vos traceurs » si vous avez des boîtiers SS CAR SYSTEM, sinon « Ajouter un véhicule » et photographiez la carte grise.',
  client: 'Touchez « Ajouter un client » puis photographiez le permis : nom, date de naissance et numéro se remplissent seuls.',
  location: 'Choisissez le client et la voiture, réglez les dates : le prix et le contrat se calculent tout seuls.',
  appli: 'Ouvrez cette page sur votre téléphone et ajoutez Fleet à l’écran d’accueil : l’appli se connecte avec le même compte.',
  edl: 'Sur l’appli, ouvrez la location puis « Faire le départ » : 4 étapes, photos guidées, signature au doigt.',
  amende: 'Touchez « Ajouter » et photographiez l’avis : Fleet lit la plaque et la date, puis retrouve qui conduisait.',
  planning: 'Attrapez une location et glissez-la sur un autre jour, ou tirez son bord droit pour la prolonger.',
  gps: 'Chaque point est une voiture : touchez-la pour voir qui l’a, sa vitesse, et la couper à distance si besoin.',
  retour: 'Ouvrez une location en cours puis « Faire le retour » sur l’appli : Fleet compare tout avec le départ.',
  pilotage: 'Chaque ligne est une voiture : ce qu’elle rapporte, ce qu’elle coûte et son taux de location.',
};

export default function GuideMission() {
  const [ferme, setFerme] = useState(false);
  const [cle, setCle] = useState<string | null>(null);
  useEffect(() => { setCle(new URLSearchParams(window.location.search).get('guide')); }, []);
  const m = MISSIONS.find((x) => x.cle === cle);
  useEffect(() => { if (m && DECOUVERTES_PAR_VISITE.includes(m.cle)) marquerDecouverte(m.cle); }, [m]);
  if (!m || ferme) return null;
  return (
    <div className="guide-mission" role="status">
      <span className="guide-ic">★</span>
      <span style={{ flex: 1, minWidth: 0 }}><b>Mission : {m.titre}</b><span>{CONSIGNES[m.cle] ?? m.pourquoi}</span></span>
      <button type="button" className="bouton petit" onClick={() => setFerme(true)}>Compris</button>
    </div>
  );
}
