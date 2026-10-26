'use client';
// Choix à la main du chauffeur ou du camion d'une tournée, directement dans le planning
import { useTransition } from 'react';
import { annoncer } from './Toast';

type Option = { id: string; libelle: string; groupe?: string };
export default function ChoixTournee({ valeur, options, action, vide, libelle }: {
  valeur: string | null; options: Option[]; vide: string; libelle: string;
  action: (v: string | null) => Promise<{ erreur?: string } | void>;
}) {
  const [attente, demarrer] = useTransition();
  const groupes = Array.from(new Set(options.map((o) => o.groupe ?? '')));
  return (
    <select className={`choix-tournee${valeur ? '' : ' vide'}`} aria-label={libelle} value={valeur ?? ''} disabled={attente}
      onChange={(e) => { const v = e.target.value || null; demarrer(async () => { const r = await action(v); if (r && r.erreur) annoncer(r.erreur, true); }); }}>
      <option value="">{vide}</option>
      {groupes.map((g) => g ? (
        <optgroup key={g} label={g}>{options.filter((o) => o.groupe === g).map((o) => <option key={o.id} value={o.id}>{o.libelle}</option>)}</optgroup>
      ) : options.filter((o) => !o.groupe).map((o) => <option key={o.id} value={o.id}>{o.libelle}</option>))}
    </select>
  );
}
