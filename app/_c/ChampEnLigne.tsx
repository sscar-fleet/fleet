'use client';
// Valeur modifiable directement dans un tableau : un clic, on tape, Entrée (ou on clique ailleurs) et c'est enregistré.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { annoncer } from './Toast';
import { modifierEnLigne } from '../actions';

export default function ChampEnLigne({ table, id, champ, valeur, affichage, suffixe }: { table: 'vehicules'; id: string; champ: 'km' | 'prix_jour'; valeur: number | null; affichage: string; suffixe?: string }) {
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(valeur != null ? String(valeur) : '');
  const [vu, setVu] = useState(affichage);
  const router = useRouter();
  async function enregistrer() {
    setEdition(false);
    const n = texte.trim() === '' ? null : Number(texte.replace(',', '.').replace(/\s/g, ''));
    if (n === valeur || (n != null && !isFinite(n))) return;
    const r = await modifierEnLigne(table, id, champ, n);
    if (r?.erreur) { annoncer(r.erreur, true); return; }
    setVu(n == null ? '—' : `${n.toLocaleString('fr-FR')}${suffixe ?? ''}`);
    annoncer('Enregistré'); router.refresh();
  }
  if (edition) return (
    <input autoFocus inputMode="decimal" className="champ-en-ligne" value={texte} onChange={(e) => setTexte(e.target.value)}
      onBlur={enregistrer} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setTexte(valeur != null ? String(valeur) : ''); setEdition(false); } }} />
  );
  return <button type="button" className="valeur-en-ligne" title="Cliquer pour modifier" onClick={() => setEdition(true)}>{vu}</button>;
}
